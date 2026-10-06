import { describe, expect, it, vi } from 'vitest'
import { LiquidLayer, Side, type Position } from './liquid-layer'
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

    const position = layer.openPosition(Side.Long, 1, 60000)

    expect(position).toEqual(
      aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
    )
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

    expect(result.realizedPnl).toBe(1000)
    expect(result.position).toEqual(
      aPosition()
        .id('pos-1')
        .long()
        .size(1)
        .entryPrice(60000)
        .exitPrice(61000)
        .build(),
    )
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

    expect(result.realizedPnl).toBe(1000)
    expect(result.position).toEqual(
      aPosition()
        .id('pos-2')
        .short()
        .size(1)
        .entryPrice(60000)
        .exitPrice(59000)
        .build(),
    )
    expect(closePosition).toHaveBeenCalledTimes(1)
    expect(closePosition).toHaveBeenCalledWith('pos-2', 59000)
  })

  it('a consumer deposits collateral and sees the updated balance without knowing which protocol holds it', () => {
    const { provider, depositCollateral } = fakeCollateralProvider()
    const layer = new LiquidLayer(provider)

    const updatedBalance = layer.depositCollateral(1000)

    expect(updatedBalance).toBe(1000)
    expect(depositCollateral).toHaveBeenCalledTimes(1)
    expect(depositCollateral).toHaveBeenCalledWith(1000)
  })

  it('a consumer withdraws collateral and sees the updated balance', () => {
    const { provider, withdrawCollateral } = fakeCollateralProvider()
    const layer = new LiquidLayer(provider)

    layer.depositCollateral(1000)
    const updatedBalance = layer.withdrawCollateral(400)

    expect(updatedBalance).toBe(600)
    expect(withdrawCollateral).toHaveBeenCalledTimes(1)
    expect(withdrawCollateral).toHaveBeenCalledWith(400)
  })

  it('rejects opening a position when collateral is below the required initial margin', () => {
    const { provider } = fakeCollateralProvider(500)
    const layer = new LiquidLayer(provider)

    expect(() => layer.openPosition(Side.Long, 1, 60000)).toThrow(
      'insufficient margin',
    )
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('a consumer checks the collateral balance through the layer without knowing the protocol', () => {
    const { provider, getCollateralBalance } = fakeCollateralProvider(1000)
    const layer = new LiquidLayer(provider)

    const balance = layer.getCollateralBalance()

    expect(balance).toBe(1000)
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

    expect(result.realizedPnl).toBe(1000)
    expect(layer.getCollateralBalance()).toBe(6000)
    expect(settlePnl).toHaveBeenCalledTimes(1)
    expect(settlePnl).toHaveBeenCalledWith(1000)
  })

  it('a consumer queries an open position by id through the layer without knowing the protocol', () => {
    const getPosition = vi.fn(
      (id: string): Position =>
        aPosition().id(id).long().size(1).entryPrice(60000).build(),
    )
    const provider = fakeProvider({ getPosition })
    const layer = new LiquidLayer(provider)

    const position = layer.getPosition('pos-1')

    expect(position).toEqual(
      aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
    )
    expect(getPosition).toHaveBeenCalledTimes(1)
    expect(getPosition).toHaveBeenCalledWith('pos-1')
  })

  it('charges funding on a long position and reduces the collateral balance', () => {
    const getPosition = vi.fn(
      (id: string): Position =>
        aPosition().id(id).long().size(1).entryPrice(60000).build(),
    )
    const { provider, settleFunding } = fakeCollateralProvider(5000, {
      getPosition,
      getFundingRate: () => 0.0001,
    })
    const layer = new LiquidLayer(provider)

    layer.payFunding('pos-1')

    expect(settleFunding).toHaveBeenCalledTimes(1)
    expect(settleFunding).toHaveBeenCalledWith(-6)
    expect(layer.getCollateralBalance()).toBe(4994)
  })
})
