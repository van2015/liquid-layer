export interface OpenPositionParams {
  side: 'long' | 'short'
  size: number
  entryPrice: number
}

export interface Position {
  id: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  exitPrice?: number
}

export interface ClosePositionParams {
  id: string
  exitPrice: number
}

export interface ClosePositionResult {
  realizedPnl: number
  position: Position
}

export interface DepositCollateralParams {
  amount: number
}

export interface LiquidityProvider {
  openPosition(params: OpenPositionParams): Position
  closePosition(params: ClosePositionParams): Position
  depositCollateral(params: DepositCollateralParams): number
}

export class LiquidLayer {
  constructor(private readonly provider: LiquidityProvider) {}

  openPosition(params: OpenPositionParams): Position {
    return this.provider.openPosition(params)
  }

  closePosition(params: ClosePositionParams): ClosePositionResult {
    const position = this.provider.closePosition(params)
    const direction = position.side === 'long' ? 1 : -1
    const realizedPnl =
      (params.exitPrice - position.entryPrice) * position.size * direction
    return { realizedPnl, position }
  }

  depositCollateral(params: DepositCollateralParams): number {
    return this.provider.depositCollateral(params)
  }
}
