export enum Side {
  Long = 'long',
  Short = 'short',
}

export interface DomainError {
  readonly type: string
}

export type Money = number

export type InsufficientMargin = {
  readonly type: 'InsufficientMargin'
  readonly required: Money
  readonly available: Money
}

export type PositionNotFound = {
  readonly type: 'PositionNotFound'
  readonly id: string
}

export type InsufficientBalance = {
  readonly type: 'InsufficientBalance'
  readonly requested: Money
  readonly available: Money
}

export type InvalidAmount = {
  readonly type: 'InvalidAmount'
  readonly amount: Money
}

export type Result<T, E extends DomainError> =
  | { success: true; value: T }
  | { success: false; error: E }

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
  getPosition(id: string): Result<Position, PositionNotFound>
}

export class LiquidLayer {
  constructor(private readonly provider: LiquidityProvider) {}

  openPosition(
    side: Side,
    size: number,
    entryPrice: number,
  ): Result<Position, InsufficientMargin> {
    const requiredMargin = this.provider.getRequiredMargin(
      side,
      size,
      entryPrice,
    )
    const balance = this.provider.getCollateralBalance()
    if (balance < requiredMargin) {
      return {
        success: false,
        error: {
          type: 'InsufficientMargin',
          required: requiredMargin,
          available: balance,
        },
      }
    }
    return {
      success: true,
      value: this.provider.openPosition(side, size, entryPrice),
    }
  }

  closePosition(
    id: string,
    exitPrice: number,
  ): Result<{ realizedPnl: number; position: Position }, PositionNotFound> {
    const found = this.provider.getPosition(id)
    if (!found.success) {
      return found
    }
    const position = this.provider.closePosition(id, exitPrice)
    const direction = position.side === Side.Long ? 1 : -1
    const realizedPnl =
      (exitPrice - position.entryPrice) * position.size * direction
    this.provider.settlePnl(realizedPnl)
    return { success: true, value: { realizedPnl, position } }
  }

  depositCollateral(amount: number): Result<number, InvalidAmount> {
    if (amount < 0) {
      return {
        success: false,
        error: { type: 'InvalidAmount', amount },
      }
    }
    return { success: true, value: this.provider.depositCollateral(amount) }
  }

  withdrawCollateral(
    amount: number,
  ): Result<number, InsufficientBalance | InvalidAmount> {
    if (amount < 0) {
      return {
        success: false,
        error: { type: 'InvalidAmount', amount },
      }
    }
    const balance = this.provider.getCollateralBalance()
    if (amount > balance) {
      return {
        success: false,
        error: {
          type: 'InsufficientBalance',
          requested: amount,
          available: balance,
        },
      }
    }
    return { success: true, value: this.provider.withdrawCollateral(amount) }
  }

  getCollateralBalance(): number {
    return this.provider.getCollateralBalance()
  }

  getPosition(id: string): Result<Position, PositionNotFound> {
    return this.provider.getPosition(id)
  }

  payFunding(id: string): Result<void, PositionNotFound> {
    const found = this.provider.getPosition(id)
    if (!found.success) {
      return found
    }
    const { size, entryPrice, side } = found.value
    const amount = size * entryPrice * this.provider.getFundingRate()
    this.provider.settleFunding(side === Side.Long ? -amount : amount)
    return { success: true, value: undefined }
  }
}
