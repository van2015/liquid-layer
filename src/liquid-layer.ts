export enum Side {
  Long = 'long',
  Short = 'short',
}

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export type InsufficientMarginError = { kind: 'insufficientMargin' }

export type PositionNotFoundError = { kind: 'positionNotFound'; id: string }

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
  getPosition(id: string): Result<Position, PositionNotFoundError>
}

export class LiquidLayer {
  constructor(private readonly provider: LiquidityProvider) {}

  openPosition(
    side: Side,
    size: number,
    entryPrice: number,
  ): Result<Position, InsufficientMarginError> {
    const requiredMargin = this.provider.getRequiredMargin(
      side,
      size,
      entryPrice,
    )
    const balance = this.provider.getCollateralBalance()
    if (balance < requiredMargin) {
      return { ok: false, error: { kind: 'insufficientMargin' } }
    }
    return {
      ok: true,
      value: this.provider.openPosition(side, size, entryPrice),
    }
  }

  closePosition(
    id: string,
    exitPrice: number,
  ): Result<{ realizedPnl: number; position: Position }, PositionNotFoundError> {
    const found = this.provider.getPosition(id)
    if (!found.ok) {
      return found
    }
    const position = this.provider.closePosition(id, exitPrice)
    const direction = position.side === Side.Long ? 1 : -1
    const realizedPnl =
      (exitPrice - position.entryPrice) * position.size * direction
    this.provider.settlePnl(realizedPnl)
    return { ok: true, value: { realizedPnl, position } }
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

  getPosition(id: string): Result<Position, PositionNotFoundError> {
    return this.provider.getPosition(id)
  }

  payFunding(id: string): Result<void, PositionNotFoundError> {
    const found = this.provider.getPosition(id)
    if (!found.ok) {
      return found
    }
    const { size, entryPrice } = found.value
    const amount = size * entryPrice * this.provider.getFundingRate()
    this.provider.settleFunding(-amount)
    return { ok: true, value: undefined }
  }
}
