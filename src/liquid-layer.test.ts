import { describe, expect, it, vi } from 'vitest'
import {
  LiquidLayer,
  type ClosePositionParams,
  type DepositCollateralParams,
  type OpenPositionParams,
  type Position,
} from './liquid-layer'
import { fakeProvider } from './test-support/fake-provider'
import { aPosition } from './test-support/position-builder'

describe('LiquidLayer', () => {
  it('a consumer opens a long position through LiquidLayer without knowing the underlying liquidity provider', () => {
    const openPosition = vi.fn(
      (params: OpenPositionParams): Position =>
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
      side: 'long',
      size: 1,
      entryPrice: 60000,
    })

    expect(position).toEqual(
      aPosition().id('pos-1').long().size(1).entryPrice(60000).build(),
    )
    expect(openPosition).toHaveBeenCalledTimes(1)
    expect(openPosition).toHaveBeenCalledWith({
      side: 'long',
      size: 1,
      entryPrice: 60000,
    })
  })

  it('a consumer closes a long position and the layer calculates the realized PnL', () => {
    const closePosition = vi.fn(
      (params: ClosePositionParams): Position =>
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
      (params: ClosePositionParams): Position =>
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
    let balance = 0
    const depositCollateral = vi.fn(
      (params: DepositCollateralParams): number => {
        balance += params.amount
        return balance
      },
    )
    const provider = fakeProvider({ depositCollateral })
    const layer = new LiquidLayer(provider)

    const updatedBalance = layer.depositCollateral({ amount: 1000 })

    expect(updatedBalance).toBe(1000)
    expect(depositCollateral).toHaveBeenCalledTimes(1)
    expect(depositCollateral).toHaveBeenCalledWith({ amount: 1000 })
  })
})
