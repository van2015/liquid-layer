import { Side, type Trade } from '../liquid-layer'

export class TradeBuilder {
  private readonly state: Trade

  constructor(side: Side) {
    this.state = { side, size: 1, entryPrice: 0 }
  }

  size(size: number): this {
    this.state.size = size
    return this
  }

  entryPrice(entryPrice: number): this {
    this.state.entryPrice = entryPrice
    return this
  }

  build(): Trade {
    return { ...this.state }
  }
}

class TradeSideStep {
  long(): TradeBuilder {
    return new TradeBuilder(Side.Long)
  }

  short(): TradeBuilder {
    return new TradeBuilder(Side.Short)
  }
}

export function aTrade(): TradeSideStep {
  return new TradeSideStep()
}
