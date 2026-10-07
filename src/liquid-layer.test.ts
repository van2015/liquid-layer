import { describe, expect, it, vi } from 'vitest'
import {
  LiquidLayer,
  Side,
  type LiquidityProvider,
  type Position,
  type PositionNotFound,
  type Result,
  type UpstreamFailure,
} from './liquid-layer'
import { fakeProvider } from './test-support/fake-provider'
import {
  fakeCollateralProvider,
  preparedTx,
} from './test-support/fake-collateral-provider'
import { aPosition } from './test-support/position-builder'
import { aTrade } from './test-support/trade-builder'

function layerWith(
  balance = 0,
  overrides: Partial<LiquidityProvider> = {},
) {
  const fakes = fakeCollateralProvider(balance, overrides)
  return { ...fakes, layer: new LiquidLayer(fakes.provider) }
}

function failingCall(operation: string) {
  return vi.fn(async () => ({
    success: false as const,
    error: { type: 'UpstreamFailure' as const, operation },
  }))
}

describe('LiquidLayer', async () => {
  it('a consumer opens a long position through LiquidLayer without knowing the underlying liquidity provider', async () => {
    const openPosition = vi.fn(async () => ({
      success: true as const,
      value: preparedTx,
    }))
    const provider = fakeProvider({ openPosition })
    const layer = new LiquidLayer(provider)

    const result = await layer.openPosition(aTrade().long().entryPrice(60000).build())

    expect(result).toEqual({ success: true, value: preparedTx })
    expect(openPosition).toHaveBeenCalledTimes(1)
    expect(openPosition).toHaveBeenCalledWith({
      side: Side.Long,
      size: 1,
      entryPrice: 60000,
    })
  })

  it('a consumer closes a long position and the layer calculates the realized PnL', async () => {
    const closePosition = vi.fn(async () => ({
      success: true as const,
      value: preparedTx,
    }))
    const provider = fakeProvider({
      closePosition,
      getPosition: vi.fn(async () => ({
        success: true as const,
        value: aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
      })),
    })
    const layer = new LiquidLayer(provider)

    const result = await layer.closePosition('pos-1', 61000)

    expect(result).toEqual({ success: true, value: preparedTx })
    expect(closePosition).toHaveBeenCalledTimes(1)
    expect(closePosition).toHaveBeenCalledWith('pos-1', 61000)
    expect(provider.settlePnl).toHaveBeenCalledWith(1000)
  })

  it('closes a short position and calculates PnL with inverted direction', async () => {
    const closePosition = vi.fn(async () => ({
      success: true as const,
      value: preparedTx,
    }))
    const provider = fakeProvider({
      closePosition,
      getPosition: vi.fn(async () => ({
        success: true as const,
        value: aPosition().id('pos-2').short().size(1).entryPrice(60000).build(),
      })),
    })
    const layer = new LiquidLayer(provider)

    const result = await layer.closePosition('pos-2', 59000)

    expect(result).toEqual({ success: true, value: preparedTx })
    expect(closePosition).toHaveBeenCalledTimes(1)
    expect(closePosition).toHaveBeenCalledWith('pos-2', 59000)
    expect(provider.settlePnl).toHaveBeenCalledWith(1000)
  })

  it('a consumer deposits collateral and sees the updated balance without knowing which protocol holds it', async () => {
    const { layer, depositCollateral } = layerWith()

    const result = await layer.depositCollateral(1000)

    expect(result).toEqual({ success: true, value: preparedTx })
    expect(depositCollateral).toHaveBeenCalledTimes(1)
    expect(depositCollateral).toHaveBeenCalledWith(1000)
    expect(await layer.getCollateralBalance()).toEqual({
      success: true,
      value: 1000,
    })
  })

  it('rejects depositing a negative amount', async () => {
    const { layer, depositCollateral } = layerWith(500)

    expect(await layer.depositCollateral(-100)).toEqual({
      success: false,
      error: { type: 'InvalidAmount', amount: -100 },
    })
    expect(depositCollateral).not.toHaveBeenCalled()
  })

  it('a consumer withdraws collateral and sees the updated balance', async () => {
    const { layer, withdrawCollateral } = layerWith()

    await layer.depositCollateral(1000)
    const result = await layer.withdrawCollateral(400)

    expect(result).toEqual({ success: true, value: preparedTx })
    expect(withdrawCollateral).toHaveBeenCalledTimes(1)
    expect(withdrawCollateral).toHaveBeenCalledWith(400)
    expect(await layer.getCollateralBalance()).toEqual({
      success: true,
      value: 600,
    })
  })

  it('rejects withdrawing more collateral than the available balance', async () => {
    const { layer, withdrawCollateral } = layerWith(500)

    expect(await layer.withdrawCollateral(1000)).toEqual({
      success: false,
      error: { type: 'InsufficientBalance', requested: 1000, available: 500 },
    })
    expect(withdrawCollateral).not.toHaveBeenCalled()
  })

  it('rejects withdrawing a negative amount', async () => {
    const { layer, withdrawCollateral } = layerWith(500)

    expect(await layer.withdrawCollateral(-100)).toEqual({
      success: false,
      error: { type: 'InvalidAmount', amount: -100 },
    })
    expect(withdrawCollateral).not.toHaveBeenCalled()
  })

  it('rejects opening a position when collateral is below the required initial margin', async () => {
    const { provider, layer } = layerWith(500)

    expect(await layer.openPosition(aTrade().long().entryPrice(60000).build())).toEqual({
      success: false,
      error: { type: 'InsufficientMargin', required: 6000, available: 500 },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('rejects opening a position with a non-positive size', async () => {
    const { provider, layer } = layerWith(5000)

    expect(
      await layer.openPosition(aTrade().long().size(0).entryPrice(60000).build()),
    ).toEqual({
      success: false,
      error: { type: 'InvalidSize', size: 0 },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('rejects opening a position with a non-positive entry price', async () => {
    const { provider, layer } = layerWith(5000)

    expect(
      await layer.openPosition(aTrade().long().entryPrice(0).build()),
    ).toEqual({
      success: false,
      error: { type: 'InvalidPrice', price: 0 },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('rejects closing a position with a non-positive exit price', async () => {
    const { provider, layer } = layerWith(5000)

    expect(await layer.closePosition('pos-1', -100)).toEqual({
      success: false,
      error: { type: 'InvalidPrice', price: -100 },
    })
    expect(provider.closePosition).not.toHaveBeenCalled()
    expect(provider.settlePnl).not.toHaveBeenCalled()
  })

  it('a consumer checks the collateral balance through the layer without knowing the protocol', async () => {
    const { layer, getCollateralBalance } = layerWith(1000)

    const balance = await layer.getCollateralBalance()

    expect(balance).toEqual({ success: true, value: 1000 })
    expect(getCollateralBalance).toHaveBeenCalledTimes(1)
  })

  it('settles the realized PnL into the collateral balance when a position is closed', async () => {
    const closePosition = vi.fn(async () => ({
      success: true as const,
      value: preparedTx,
    }))
    const { layer, settlePnl } = layerWith(5000, {
      closePosition,
      getPosition: vi.fn(async () => ({
        success: true as const,
        value: aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
      })),
    })

    const result = await layer.closePosition('pos-1', 61000)

    expect(result).toEqual({ success: true, value: preparedTx })
    expect(await layer.getCollateralBalance()).toEqual({ success: true, value: 6000 })
    expect(settlePnl).toHaveBeenCalledTimes(1)
    expect(settlePnl).toHaveBeenCalledWith(1000)
  })

  it('a consumer queries an open position by id through the layer without knowing the protocol', async () => {
    const getPosition = vi.fn(
      async (
        id: string,
      ): Promise<Result<Position, PositionNotFound>> => ({
        success: true,
        value: aPosition().id(id).long().size(1).entryPrice(60000).build(),
      }),
    )
    const provider = fakeProvider({ getPosition })
    const layer = new LiquidLayer(provider)

    const result = await layer.getPosition('pos-1')

    expect(result).toEqual({
      success: true,
      value: aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
    })
    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(getPosition).toHaveBeenCalledWith('pos-1')
  })

  it('a consumer lists open positions through the layer without knowing the protocol', async () => {
    const listPositions = vi.fn(
      async (): Promise<Result<Position[], UpstreamFailure>> => ({
        success: true,
        value: [
          aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
          aPosition().id('pos-2').short().size(1).entryPrice(60000).build(),
        ],
      }),
    )
    const provider = fakeProvider({ listPositions })
    const layer = new LiquidLayer(provider)

    expect(await layer.listPositions()).toEqual({
      success: true,
      value: [
        aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
        aPosition().id('pos-2').short().size(1).entryPrice(60000).build(),
      ],
    })
    expect(listPositions).toHaveBeenCalledTimes(1)
    expect(listPositions).toHaveBeenCalledWith()
  })

  it('computes the equity of a long position at the current mark price', async () => {
    const { layer, settlePnl, settleFunding } = layerWith(6000, {
      getPosition: vi.fn(async () => ({
        success: true as const,
        value: aPosition()
          .id('pos-1')
          .long()
          .size(1)
          .entryPrice(60000)
          .build(),
      })),
    })

    expect(await layer.getEquity('pos-1', 55000)).toEqual({
      success: true,
      value: 1000,
    })
    expect(settlePnl).not.toHaveBeenCalled()
    expect(settleFunding).not.toHaveBeenCalled()
  })

  it('liquidates a position when equity falls below the maintenance margin', async () => {
    const closePosition = vi.fn(async () => ({
      success: true as const,
      value: preparedTx,
    }))
    const { layer, settlePnl, getCollateralBalance } = layerWith(6000, {
      getPosition: vi.fn(async () => ({
        success: true as const,
        value: aPosition()
          .id('pos-1')
          .long()
          .size(1)
          .entryPrice(60000)
          .build(),
      })),
      closePosition,
    })

    expect(await layer.checkLiquidation('pos-1', 55000)).toEqual({
      success: true,
      value: {
        liquidated: true,
        exitPrice: 55000,
        realizedPnl: -5000,
        tx: preparedTx,
      },
    })
    expect(closePosition).toHaveBeenCalledWith('pos-1', 55000)
    expect(settlePnl).toHaveBeenCalledWith(-5000)
    expect(await getCollateralBalance()).toEqual({ success: true, value: 1000 })
  })

  it('rejects closing a position that was already closed', async () => {
    const { provider, layer, settlePnl } = layerWith(6000, {
      getPosition: vi.fn(async () => ({
        success: true as const,
        value: {
          ...aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
          exitPrice: 55000,
        },
      })),
    })

    expect(await layer.closePosition('pos-1', 56000)).toEqual({
      success: false,
      error: { type: 'PositionAlreadyClosed', id: 'pos-1' },
    })
    expect(provider.closePosition).not.toHaveBeenCalled()
    expect(settlePnl).not.toHaveBeenCalled()
  })

  it('rejects closing a position whose loss exceeds the collateral balance', async () => {
    const { provider, layer, settlePnl } = layerWith(6000, {
      getPosition: vi.fn(async () => ({
        success: true as const,
        value: aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
      })),
    })

    expect(await layer.closePosition('pos-1', 1000)).toEqual({
      success: false,
      error: { type: 'InsufficientBalance', requested: 59000, available: 6000 },
    })
    expect(provider.closePosition).not.toHaveBeenCalled()
    expect(settlePnl).not.toHaveBeenCalled()
  })

  it('rejects paying funding for a position that was already closed', async () => {
    const { layer, settleFunding } = layerWith(5000, {
      getPosition: vi.fn(async () => ({
        success: true as const,
        value: {
          ...aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
          exitPrice: 55000,
        },
      })),
    })

    expect(await layer.payFunding('pos-1')).toEqual({
      success: false,
      error: { type: 'PositionAlreadyClosed', id: 'pos-1' },
    })
    expect(settleFunding).not.toHaveBeenCalled()
  })

  it('rejects computing equity with a non-positive mark price', async () => {
    const getPosition = vi.fn(async () => ({
      success: true as const,
      value: aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
    }))
    const { layer } = layerWith(6000, { getPosition })

    expect(await layer.getEquity('pos-1', -100)).toEqual({
      success: false,
      error: { type: 'InvalidPrice', price: -100 },
    })
    expect(getPosition).not.toHaveBeenCalled()
  })

  it('rejects computing equity for a position that was already closed', async () => {
    const { layer } = layerWith(6000, {
      getPosition: vi.fn(async () => ({
        success: true as const,
        value: {
          ...aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
          exitPrice: 55000,
        },
      })),
    })

    expect(await layer.getEquity('pos-1', 55000)).toEqual({
      success: false,
      error: { type: 'PositionAlreadyClosed', id: 'pos-1' },
    })
  })

  it('lists only open positions, hiding already closed ones', async () => {
    const listPositions = vi.fn(
      async (): Promise<Result<Position[], UpstreamFailure>> => ({
        success: true,
        value: [
          aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
          {
            ...aPosition()
              .id('pos-2')
              .short()
              .size(1)
              .entryPrice(60000)
              .build(),
            exitPrice: 55000,
          },
        ],
      }),
    )
    const provider = fakeProvider({ listPositions })
    const layer = new LiquidLayer(provider)

    expect(await layer.listPositions()).toEqual({
      success: true,
      value: [aPosition().id('pos-1').long().size(1).entryPrice(60000).build()],
    })
  })

  it('charges funding on a long position and reduces the collateral balance', async () => {
    const getPosition = vi.fn(
      async (
        id: string,
      ): Promise<Result<Position, PositionNotFound>> => ({
        success: true,
        value: aPosition().id(id).long().size(1).entryPrice(60000).build(),
      }),
    )
    const { layer, settleFunding } = layerWith(5000, {
      getPosition,
      getFundingRate: async () => ({ success: true as const, value: 0.0001 }),
    })

    const result = await layer.payFunding('pos-1')

    expect(result).toEqual({ success: true, value: undefined })
    expect(settleFunding).toHaveBeenCalledTimes(1)
    expect(settleFunding).toHaveBeenCalledWith(-6)
    expect(await layer.getCollateralBalance()).toEqual({ success: true, value: 4994 })
  })

  it('credits funding to a short position when the rate is positive', async () => {
    const getPosition = vi.fn(
      async (
        id: string,
      ): Promise<Result<Position, PositionNotFound>> => ({
        success: true,
        value: aPosition().id(id).short().size(1).entryPrice(60000).build(),
      }),
    )
    const { layer, settleFunding } = layerWith(5000, {
      getPosition,
      getFundingRate: async () => ({ success: true as const, value: 0.0001 }),
    })

    const result = await layer.payFunding('pos-2')

    expect(result).toEqual({ success: true, value: undefined })
    expect(settleFunding).toHaveBeenCalledTimes(1)
    expect(settleFunding).toHaveBeenCalledWith(6)
    expect(await layer.getCollateralBalance()).toEqual({ success: true, value: 5006 })
  })

  it('rejects closing a position that does not exist', async () => {
    const closePosition = vi.fn(async () => ({
      success: true as const,
      value: preparedTx,
    }))
    const getPosition = vi.fn(
      async (
        id: string,
      ): Promise<Result<Position, PositionNotFound>> =>
        id === 'pos-1'
          ? {
              success: true,
              value: aPosition()
                .id(id)
                .long()
                .size(1)
                .entryPrice(60000)
                .build(),
            }
          : { success: false, error: { type: 'PositionNotFound', id } },
    )
    const { layer } = layerWith(5000, { closePosition, getPosition })

    expect(await layer.closePosition('pos-9', 1000)).toEqual({
      success: false,
      error: { type: 'PositionNotFound', id: 'pos-9' },
    })
    expect(closePosition).not.toHaveBeenCalled()
  })

  it('propagates an upstream failure when the collateral balance cannot be read', async () => {
    const getCollateralBalance = failingCall('getCollateralBalance')
    const provider = fakeProvider({ getCollateralBalance })
    const layer = new LiquidLayer(provider)

    expect(await layer.openPosition(aTrade().long().entryPrice(60000).build())).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'getCollateralBalance' },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('propagates an upstream failure when the required margin cannot be read', async () => {
    const getRequiredMargin = failingCall('getRequiredMargin')
    const provider = fakeProvider({ getRequiredMargin })
    const layer = new LiquidLayer(provider)

    expect(await layer.openPosition(aTrade().long().entryPrice(60000).build())).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'getRequiredMargin' },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('propagates an upstream failure when the funding rate cannot be read', async () => {
    const getFundingRate = failingCall('getFundingRate')
    const provider = fakeProvider({ getFundingRate })
    const layer = new LiquidLayer(provider)

    expect(await layer.payFunding('pos-1')).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'getFundingRate' },
    })
    expect(provider.settleFunding).not.toHaveBeenCalled()
  })

  it('propagates an upstream failure when a position cannot be read', async () => {
    const listPositions = failingCall('listPositions')
    const provider = fakeProvider({ listPositions })
    const layer = new LiquidLayer(provider)

    expect(await layer.listPositions()).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'listPositions' },
    })
  })

  it('reads the collateral balance asynchronously', async () => {
    const { layer } = layerWith(1000)

    const pending = layer.getCollateralBalance()
    await expect(pending).resolves.toEqual({
      success: true,
      value: 1000,
    })
  })

  it('propagates an upstream failure when a settled PnL cannot be applied', async () => {
    const settlePnl = failingCall('settlePnl')
    const { layer } = layerWith(5000, {
      settlePnl,
      getPosition: vi.fn(async () => ({
        success: true as const,
        value: aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
      })),
      closePosition: vi.fn(async () => ({
        success: true as const,
        value: preparedTx,
      })),
    })

    expect(await layer.closePosition('pos-1', 61000)).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'settlePnl' },
    })
    expect(settlePnl).toHaveBeenCalledTimes(1)
  })
})
