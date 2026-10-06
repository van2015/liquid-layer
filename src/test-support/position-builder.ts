import { Side, type Position } from '../liquid-layer'

export class PositionBuilder {
  private readonly state: Position = {
    id: 'pos-1',
    side: Side.Long,
    size: 1,
    entryPrice: 0,
  }

  id(id: string): this {
    this.state.id = id
    return this
  }

  side(side: Side): this {
    this.state.side = side
    return this
  }

  long(): this {
    return this.side(Side.Long)
  }

  short(): this {
    return this.side(Side.Short)
  }

  size(size: number): this {
    this.state.size = size
    return this
  }

  entryPrice(entryPrice: number): this {
    this.state.entryPrice = entryPrice
    return this
  }

  exitPrice(exitPrice: number): this {
    this.state.exitPrice = exitPrice
    return this
  }

  build(): Position {
    return { ...this.state }
  }
}

export function aPosition(): PositionBuilder {
  return new PositionBuilder()
}
