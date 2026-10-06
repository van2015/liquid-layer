import { describe, expect, it, vi } from 'vitest'
import {
  LiquidLayer,
  Side,
  type Position,
  type PositionNotFound,
  type Result,
} from './liquid-layer'
import { fakeProvider } from './test-support/fake-provider'
import { fakeCollateralProvider } from './test-support/fake-collateral-provider'
import { aPosition } from './test-support/position-builder'

describe('LiquidLayer', () => {
  it('a consumer opens a long position through LiquidLayer without knowing the underlying liquidity provider', () => {
    const openPosition = vi.fn(
      (side: Side, size: number, entryPrice: number): Position =>
        aPosition()
          .id('pos-1')
          .side(side)
          .size(size)
          .entryPrice(entryPrice)
          .build(),
    )
    const provider = fakeProvider({ openPosition })
    const layer = new LiquidLayer(provider)

    const result = layer.openPosition(Side.Long, 1, 60000)

    expect(result).toEqual({
      success: true,
      value: aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
    })
    expect(openPosition).toHaveBeenCalledTimes(1)
    expect(openPosition).toHaveBeenCalledWith(Side.Long, 1, 60000)
  })

  it('a consumer closes a long position and the layer calculates the realized PnL', () => {
    const closePosition = vi.fn(
      (id: string, exitPrice: number): Position =>
        aPosition()
          .id(id)
          .long()
          .size(1)
          .entryPrice(60000)
          .exitPrice(exitPrice)
          .build(),
    )
    const provider = fakeProvider({ closePosition })
    const layer = new LiquidLayer(provider)

    const result = layer.closePosition('pos-1', 61000)

    expect(result).toEqual({
      success: true,
      value: {
        realizedPnl: 1000,
        position: aPosition()
          .id('pos-1')
          .long()
          .size(1)
          .entryPrice(60000)
          .exitPrice(61000)
          .build(),
      },
    })
    expect(closePosition).toHaveBeenCalledTimes(1)
    expect(closePosition).toHaveBeenCalledWith('pos-1', 61000)
  })

  it('closes a short position and calculates PnL with inverted direction', () => {
    const closePosition = vi.fn(
      (id: string, exitPrice: number): Position =>
        aPosition()
          .id(id)
          .short()
          .size(1)
          .entryPrice(60000)
          .exitPrice(exitPrice)
          .build(),
    )
    const provider = fakeProvider({ closePosition })
    const layer = new LiquidLayer(provider)

    const result = layer.closePosition('pos-2', 59000)

    expect(result).toEqual({
      success: true,
      value: {
        realizedPnl: 1000,
        position: aPosition()
          .id('pos-2')
          .short()
          .size(1)
          .entryPrice(60000)
          .exitPrice(59000)
          .build(),
      },
    })
    expect(closePosition).toHaveBeenCalledTimes(1)
    expect(closePosition).toHaveBeenCalledWith('pos-2', 59000)
  })

  it('a consumer deposits collateral and sees the updated balance without knowing which protocol holds it', () => {
    const { provider, depositCollateral } = fakeCollateralProvider()
    const layer = new LiquidLayer(provider)

    const result = layer.depositCollateral(1000)

    expect(result).toEqual({ success: true, value: 1000 })
    expect(depositCollateral).toHaveBeenCalledTimes(1)
    expect(depositCollateral).toHaveBeenCalledWith(1000)
  })

  it('rejects depositing a negative amount', () => {
    const { provider, depositCollateral } = fakeCollateralProvider(500)
    const layer = new LiquidLayer(provider)

    expect(layer.depositCollateral(-100)).toEqual({
      success: false,
      error: { type: 'InvalidAmount', amount: -100 },
    })
    expect(depositCollateral).not.toHaveBeenCalled()
  })

  it('a consumer withdraws collateral and sees the updated balance', () => {
    const { provider, withdrawCollateral } = fakeCollateralProvider()
    const layer = new LiquidLayer(provider)

    layer.depositCollateral(1000)
    const result = layer.withdrawCollateral(400)

    expect(result).toEqual({ success: true, value: 600 })
    expect(withdrawCollateral).toHaveBeenCalledTimes(1)
    expect(withdrawCollateral).toHaveBeenCalledWith(400)
  })

  it('rejects withdrawing more collateral than the available balance', () => {
    const { provider, withdrawCollateral } = fakeCollateralProvider(500)
    const layer = new LiquidLayer(provider)

    expect(layer.withdrawCollateral(1000)).toEqual({
      success: false,
      error: { type: 'InsufficientBalance', requested: 1000, available: 500 },
    })
    expect(withdrawCollateral).not.toHaveBeenCalled()
  })

  it('rejects withdrawing a negative amount', () => {
    const { provider, withdrawCollateral } = fakeCollateralProvider(500)
    const layer = new LiquidLayer(provider)

    expect(layer.withdrawCollateral(-100)).toEqual({
      success: false,
      error: { type: 'InvalidAmount', amount: -100 },
    })
    expect(withdrawCollateral).not.toHaveBeenCalled()
  })

  it('rejects opening a position when collateral is below the required initial margin', () => {
    const { provider } = fakeCollateralProvider(500)
    const layer = new LiquidLayer(provider)

    expect(layer.openPosition(Side.Long, 1, 60000)).toEqual({
      success: false,
      error: { type: 'InsufficientMargin', required: 6000, available: 500 },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('rejects opening a position with a non-positive size', () => {
    const { provider } = fakeCollateralProvider(5000)
    const layer = new LiquidLayer(provider)

    expect(layer.openPosition(Side.Long, 0, 60000)).toEqual({
      success: false,
      error: { type: 'InvalidSize', size: 0 },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('rejects opening a position with a non-positive entry price', () => {
    const { provider } = fakeCollateralProvider(5000)
    const layer = new LiquidLayer(provider)

    expect(layer.openPosition(Side.Long, 1, 0)).toEqual({
      success: false,
      error: { type: 'InvalidPrice', price: 0 },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('rejects closing a position with a non-positive exit price', () => {
    const { provider } = fakeCollateralProvider(5000)
    const layer = new LiquidLayer(provider)

    expect(layer.closePosition('pos-1', -100)).toEqual({
      success: false,
      error: { type: 'InvalidPrice', price: -100 },
    })
    expect(provider.closePosition).not.toHaveBeenCalled()
    expect(provider.settlePnl).not.toHaveBeenCalled()
  })

  it('a consumer checks the collateral balance through the layer without knowing the protocol', () => {
    const { provider, getCollateralBalance } = fakeCollateralProvider(1000)
    const layer = new LiquidLayer(provider)

    const balance = layer.getCollateralBalance()

    expect(balance).toEqual({ success: true, value: 1000 })
    expect(getCollateralBalance).toHaveBeenCalledTimes(1)
  })

  it('settles the realized PnL into the collateral balance when a position is closed', () => {
    const closePosition = vi.fn(
      (id: string, exitPrice: number): Position =>
        aPosition()
          .id(id)
          .long()
          .size(1)
          .entryPrice(60000)
          .exitPrice(exitPrice)
          .build(),
    )
    const { provider, settlePnl } = fakeCollateralProvider(5000, {
      closePosition,
    })
    const layer = new LiquidLayer(provider)

    const result = layer.closePosition('pos-1', 61000)

    expect(result).toEqual({
      success: true,
      value: {
        realizedPnl: 1000,
        position: aPosition()
          .id('pos-1')
          .long()
          .size(1)
          .entryPrice(60000)
          .exitPrice(61000)
          .build(),
      },
    })
    expect(layer.getCollateralBalance()).toEqual({ success: true, value: 6000 })
    expect(settlePnl).toHaveBeenCalledTimes(1)
    expect(settlePnl).toHaveBeenCalledWith(1000)
  })

  it('a consumer queries an open position by id through the layer without knowing the protocol', () => {
    const getPosition = vi.fn(
      (id: string): Result<Position, PositionNotFound> => ({
        success: true,
        value: aPosition().id(id).long().size(1).entryPrice(60000).build(),
      }),
    )
    const provider = fakeProvider({ getPosition })
    const layer = new LiquidLayer(provider)

    const result = layer.getPosition('pos-1')

    expect(result).toEqual({
      success: true,
      value: aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
    })
    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(getPosition).toHaveBeenCalledWith('pos-1')
  })

  it('a consumer lists open positions through the layer without knowing the protocol', () => {
    const listPositions = vi.fn(
      (): Position[] => [
        aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
        aPosition().id('pos-2').short().size(1).entryPrice(60000).build(),
      ],
    )
    const provider = fakeProvider({ listPositions })
    const layer = new LiquidLayer(provider)

    const positions = layer.listPositions()

    expect(positions).toEqual([
      aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
      aPosition().id('pos-2').short().size(1).entryPrice(60000).build(),
    ])
    expect(listPositions).toHaveBeenCalledTimes(1)
    expect(listPositions).toHaveBeenCalledWith()
  })

  it('computes the equity of a long position at the current mark price', () => {
    const { provider, settlePnl, settleFunding } = fakeCollateralProvider(
      6000,
      {
        getPosition: vi.fn(() => ({
          success: true as const,
          value: aPosition()
            .id('pos-1')
            .long()
            .size(1)
            .entryPrice(60000)
            .build(),
        })),
      },
    )
    const layer = new LiquidLayer(provider)

    expect(layer.getEquity('pos-1', 55000)).toEqual({
      success: true,
      value: 1000,
    })
    expect(settlePnl).not.toHaveBeenCalled()
    expect(settleFunding).not.toHaveBeenCalled()
  })

  it('liquidates a position when equity falls below the maintenance margin', () => {
    const closePosition = vi.fn((id: string, exitPrice: number) => ({
      ...aPosition().id(id).long().size(1).entryPrice(60000).build(),
      exitPrice,
    }))
    const { provider, settlePnl, getCollateralBalance } =
      fakeCollateralProvider(6000, {
        getPosition: vi.fn(() => ({
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
    const layer = new LiquidLayer(provider)

    expect(layer.checkLiquidation('pos-1', 55000)).toEqual({
      success: true,
      value: { liquidated: true, exitPrice: 55000, realizedPnl: -5000 },
    })
    expect(closePosition).toHaveBeenCalledWith('pos-1', 55000)
    expect(settlePnl).toHaveBeenCalledWith(-5000)
    expect(getCollateralBalance()).toEqual({ success: true, value: 1000 })
  })

  it('rejects closing a position that was already closed', () => {
    const { provider, settlePnl } = fakeCollateralProvider(6000, {
      getPosition: vi.fn(() => ({
        success: true as const,
        value: {
          ...aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
          exitPrice: 55000,
        },
      })),
    })
    const layer = new LiquidLayer(provider)

    expect(layer.closePosition('pos-1', 56000)).toEqual({
      success: false,
      error: { type: 'PositionAlreadyClosed', id: 'pos-1' },
    })
    expect(provider.closePosition).not.toHaveBeenCalled()
    expect(settlePnl).not.toHaveBeenCalled()
  })

  it('rejects closing a position whose loss exceeds the collateral balance', () => {
    const { provider, settlePnl } = fakeCollateralProvider(6000, {
      getPosition: vi.fn(() => ({
        success: true as const,
        value: aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
      })),
    })
    const layer = new LiquidLayer(provider)

    expect(layer.closePosition('pos-1', 1000)).toEqual({
      success: false,
      error: { type: 'InsufficientBalance', requested: 59000, available: 6000 },
    })
    expect(provider.closePosition).not.toHaveBeenCalled()
    expect(settlePnl).not.toHaveBeenCalled()
  })

  it('rejects paying funding for a position that was already closed', () => {
    const { provider, settleFunding } = fakeCollateralProvider(5000, {
      getPosition: vi.fn(() => ({
        success: true as const,
        value: {
          ...aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
          exitPrice: 55000,
        },
      })),
    })
    const layer = new LiquidLayer(provider)

    expect(layer.payFunding('pos-1')).toEqual({
      success: false,
      error: { type: 'PositionAlreadyClosed', id: 'pos-1' },
    })
    expect(settleFunding).not.toHaveBeenCalled()
  })

  it('rejects computing equity with a non-positive mark price', () => {
    const getPosition = vi.fn(() => ({
      success: true as const,
      value: aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
    }))
    const { provider } = fakeCollateralProvider(6000, { getPosition })
    const layer = new LiquidLayer(provider)

    expect(layer.getEquity('pos-1', -100)).toEqual({
      success: false,
      error: { type: 'InvalidPrice', price: -100 },
    })
    expect(getPosition).not.toHaveBeenCalled()
  })

  it('rejects computing equity for a position that was already closed', () => {
    const { provider } = fakeCollateralProvider(6000, {
      getPosition: vi.fn(() => ({
        success: true as const,
        value: {
          ...aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
          exitPrice: 55000,
        },
      })),
    })
    const layer = new LiquidLayer(provider)

    expect(layer.getEquity('pos-1', 55000)).toEqual({
      success: false,
      error: { type: 'PositionAlreadyClosed', id: 'pos-1' },
    })
  })

  it('lists only open positions, hiding already closed ones', () => {
    const listPositions = vi.fn(
      (): Position[] => [
        aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
        {
          ...aPosition().id('pos-2').short().size(1).entryPrice(60000).build(),
          exitPrice: 55000,
        },
      ],
    )
    const provider = fakeProvider({ listPositions })
    const layer = new LiquidLayer(provider)

    expect(layer.listPositions()).toEqual([
      aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
    ])
  })

  it('charges funding on a long position and reduces the collateral balance', () => {
    const getPosition = vi.fn(
      (id: string): Result<Position, PositionNotFound> => ({
        success: true,
        value: aPosition().id(id).long().size(1).entryPrice(60000).build(),
      }),
    )
    const { provider, settleFunding } = fakeCollateralProvider(5000, {
      getPosition,
      getFundingRate: () => ({ success: true as const, value: 0.0001 }),
    })
    const layer = new LiquidLayer(provider)

    const result = layer.payFunding('pos-1')

    expect(result).toEqual({ success: true, value: undefined })
    expect(settleFunding).toHaveBeenCalledTimes(1)
    expect(settleFunding).toHaveBeenCalledWith(-6)
    expect(layer.getCollateralBalance()).toEqual({ success: true, value: 4994 })
  })

  it('credits funding to a short position when the rate is positive', () => {
    const getPosition = vi.fn(
      (id: string): Result<Position, PositionNotFound> => ({
        success: true,
        value: aPosition().id(id).short().size(1).entryPrice(60000).build(),
      }),
    )
    const { provider, settleFunding } = fakeCollateralProvider(5000, {
      getPosition,
      getFundingRate: () => ({ success: true as const, value: 0.0001 }),
    })
    const layer = new LiquidLayer(provider)

    const result = layer.payFunding('pos-2')

    expect(result).toEqual({ success: true, value: undefined })
    expect(settleFunding).toHaveBeenCalledTimes(1)
    expect(settleFunding).toHaveBeenCalledWith(6)
    expect(layer.getCollateralBalance()).toEqual({ success: true, value: 5006 })
  })

  it('rejects closing a position that does not exist', () => {
    const closePosition = vi.fn(
      (id: string, exitPrice: number): Position =>
        aPosition()
          .id(id)
          .long()
          .size(1)
          .entryPrice(60000)
          .exitPrice(exitPrice)
          .build(),
    )
    const getPosition = vi.fn(
      (id: string): Result<Position, PositionNotFound> =>
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
    const { provider } = fakeCollateralProvider(5000, {
      closePosition,
      getPosition,
    })
    const layer = new LiquidLayer(provider)

    expect(layer.closePosition('pos-9', 1000)).toEqual({
      success: false,
      error: { type: 'PositionNotFound', id: 'pos-9' },
    })
    expect(closePosition).not.toHaveBeenCalled()
  })

  it('propagates an upstream failure when the collateral balance cannot be read', () => {
    const getCollateralBalance = vi.fn(() => ({
      success: false as const,
      error: {
        type: 'UpstreamFailure' as const,
        operation: 'getCollateralBalance',
      },
    }))
    const provider = fakeProvider({ getCollateralBalance })
    const layer = new LiquidLayer(provider)

    expect(layer.openPosition(Side.Long, 1, 60000)).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'getCollateralBalance' },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('propagates an upstream failure when the required margin cannot be read', () => {
    const getRequiredMargin = vi.fn(() => ({
      success: false as const,
      error: {
        type: 'UpstreamFailure' as const,
        operation: 'getRequiredMargin',
      },
    }))
    const provider = fakeProvider({ getRequiredMargin })
    const layer = new LiquidLayer(provider)

    expect(layer.openPosition(Side.Long, 1, 60000)).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'getRequiredMargin' },
    })
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('propagates an upstream failure when the funding rate cannot be read', () => {
    const getFundingRate = vi.fn(() => ({
      success: false as const,
      error: { type: 'UpstreamFailure' as const, operation: 'getFundingRate' },
    }))
    const provider = fakeProvider({ getFundingRate })
    const layer = new LiquidLayer(provider)

    expect(layer.payFunding('pos-1')).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'getFundingRate' },
    })
    expect(provider.settleFunding).not.toHaveBeenCalled()
  })
})
