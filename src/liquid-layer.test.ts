import { describe, expect, it, vi } from 'vitest'
import { LiquidLayer, Side, type Position } from './liquid-layer'
import { fakeProvider } from './test-support/fake-provider'
import { fakeCollateralProvider } from './test-support/fake-collateral-provider'
import { aPosition } from './test-support/position-builder'

describe('LiquidLayer', () => {
  it('a consumer opens a long position through LiquidLayer without knowing the underlying liquidity provider', () => {
    const openPosition = vi.fn(
      (params: { side: Side; size: number; entryPrice: number }): Position =>
        aPosition()
          .id('pos-1')
          .side(params.side)
          .size(params.size)
          .entryPrice(params.entryPrice)
          .build(),
    )
    const provider = fakeProvider({ openPosition })
    const layer = new LiquidLayer(provider)

    const position = layer.openPosition({
      side: Side.Long,
      size: 1,
      entryPrice: 60000,
    })

    expect(position).toEqual(
      aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
    )
    expect(openPosition).toHaveBeenCalledTimes(1)
    expect(openPosition).toHaveBeenCalledWith({
      side: Side.Long,
      size: 1,
      entryPrice: 60000,
    })
  })

  it('a consumer closes a long position and the layer calculates the realized PnL', () => {
    const closePosition = vi.fn(
      (params: { id: string; exitPrice: number }): Position =>
        aPosition()
          .id(params.id)
          .long()
          .size(1)
          .entryPrice(60000)
          .exitPrice(params.exitPrice)
          .build(),
    )
    const provider = fakeProvider({ closePosition })
    const layer = new LiquidLayer(provider)

    const result = layer.closePosition({ id: 'pos-1', exitPrice: 61000 })

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
    expect(closePosition).toHaveBeenCalledWith({
      id: 'pos-1',
      exitPrice: 61000,
    })
  })

  it('closes a short position and calculates PnL with inverted direction', () => {
    const closePosition = vi.fn(
      (params: { id: string; exitPrice: number }): Position =>
        aPosition()
          .id(params.id)
          .short()
          .size(1)
          .entryPrice(60000)
          .exitPrice(params.exitPrice)
          .build(),
    )
    const provider = fakeProvider({ closePosition })
    const layer = new LiquidLayer(provider)

    const result = layer.closePosition({ id: 'pos-2', exitPrice: 59000 })

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
    expect(closePosition).toHaveBeenCalledWith({
      id: 'pos-2',
      exitPrice: 59000,
    })
  })

  it('a consumer deposits collateral and sees the updated balance without knowing which protocol holds it', () => {
    const { provider, depositCollateral } = fakeCollateralProvider()
    const layer = new LiquidLayer(provider)

    const updatedBalance = layer.depositCollateral({ amount: 1000 })

    expect(updatedBalance).toBe(1000)
    expect(depositCollateral).toHaveBeenCalledTimes(1)
    expect(depositCollateral).toHaveBeenCalledWith({ amount: 1000 })
  })

  it('a consumer withdraws collateral and sees the updated balance', () => {
    const { provider, withdrawCollateral } = fakeCollateralProvider()
    const layer = new LiquidLayer(provider)

    layer.depositCollateral({ amount: 1000 })
    const updatedBalance = layer.withdrawCollateral({ amount: 400 })

    expect(updatedBalance).toBe(600)
    expect(withdrawCollateral).toHaveBeenCalledTimes(1)
    expect(withdrawCollateral).toHaveBeenCalledWith({ amount: 400 })
  })

  it('rejects opening a position when collateral is below the required initial margin', () => {
    const { provider } = fakeCollateralProvider(500)
    const layer = new LiquidLayer(provider)

    expect(() =>
      layer.openPosition({ side: Side.Long, size: 1, entryPrice: 60000 }),
    ).toThrow('insufficient margin')
    expect(provider.openPosition).not.toHaveBeenCalled()
  })

  it('a consumer checks the collateral balance through the layer without knowing the protocol', () => {
    const { provider, getCollateralBalance } = fakeCollateralProvider(1000)
    const layer = new LiquidLayer(provider)

    const balance = layer.getCollateralBalance()

    expect(balance).toBe(1000)
    expect(getCollateralBalance).toHaveBeenCalledTimes(1)
  })
})
