export interface Position {
  id: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  exitPrice?: number
}

export interface LiquidityProvider {
  openPosition(params: {
    side: 'long' | 'short'
    size: number
    entryPrice: number
  }): Position
  closePosition(params: { id: string; exitPrice: number }): Position
  depositCollateral(params: { amount: number }): number
  withdrawCollateral(params: { amount: number }): number
  getCollateralBalance(): number
  getRequiredMargin(params: {
    side: 'long' | 'short'
    size: number
    entryPrice: number
  }): number
}

export class LiquidLayer {
  constructor(private readonly provider: LiquidityProvider) {}

  openPosition(params: {
    side: 'long' | 'short'
    size: number
    entryPrice: number
  }): Position {
    const requiredMargin = this.provider.getRequiredMargin(params)
    const balance = this.provider.getCollateralBalance()
    if (balance < requiredMargin) {
      throw new Error('insufficient margin')
    }
    return this.provider.openPosition(params)
  }

  closePosition(params: {
    id: string
    exitPrice: number
  }): { realizedPnl: number; position: Position } {
    const position = this.provider.closePosition(params)
    const direction = position.side === 'long' ? 1 : -1
    const realizedPnl =
      (params.exitPrice - position.entryPrice) * position.size * direction
    return { realizedPnl, position }
  }

  depositCollateral(params: { amount: number }): number {
    return this.provider.depositCollateral(params)
  }

  withdrawCollateral(params: { amount: number }): number {
    return this.provider.withdrawCollateral(params)
  }

  getCollateralBalance(): number {
    return this.provider.getCollateralBalance()
  }
}
