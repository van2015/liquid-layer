export enum Side {
  Long = 'long',
  Short = 'short',
}

export interface Position {
  id: string
  side: Side
  size: number
  entryPrice: number
  exitPrice?: number
}

export interface LiquidityProvider {
  openPosition(side: Side, size: number, entryPrice: number): Position
  closePosition(id: string, exitPrice: number): Position
  depositCollateral(amount: number): number
  withdrawCollateral(amount: number): number
  settlePnl(amount: number): number
  settleFunding(amount: number): number
  getCollateralBalance(): number
  getRequiredMargin(side: Side, size: number, entryPrice: number): number
  getFundingRate(): number
  getPosition(id: string): Position
}

export class LiquidLayer {
  constructor(private readonly provider: LiquidityProvider) {}

  openPosition(side: Side, size: number, entryPrice: number): Position {
    const requiredMargin = this.provider.getRequiredMargin(
      side,
      size,
      entryPrice,
    )
    const balance = this.provider.getCollateralBalance()
    if (balance < requiredMargin) {
      throw new Error('insufficient margin')
    }
    return this.provider.openPosition(side, size, entryPrice)
  }

  closePosition(
    id: string,
    exitPrice: number,
  ): { realizedPnl: number; position: Position } {
    this.provider.getPosition(id)
    const position = this.provider.closePosition(id, exitPrice)
    const direction = position.side === Side.Long ? 1 : -1
    const realizedPnl = (exitPrice - position.entryPrice) * position.size * direction
    this.provider.settlePnl(realizedPnl)
    return { realizedPnl, position }
  }

  depositCollateral(amount: number): number {
    return this.provider.depositCollateral(amount)
  }

  withdrawCollateral(amount: number): number {
    return this.provider.withdrawCollateral(amount)
  }

  getCollateralBalance(): number {
    return this.provider.getCollateralBalance()
  }

  getPosition(id: string): Position {
    return this.provider.getPosition(id)
  }

  payFunding(id: string): void {
    const position = this.provider.getPosition(id)
    const rate = this.provider.getFundingRate()
    const amount = position.size * position.entryPrice * rate
    this.provider.settleFunding(-amount)
  }
}
