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

export type PositionAlreadyClosed = {
  readonly type: 'PositionAlreadyClosed'
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

export type InvalidSize = {
  readonly type: 'InvalidSize'
  readonly size: number
}

export type InvalidPrice = {
  readonly type: 'InvalidPrice'
  readonly price: number
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
  getMaintenanceMargin(side: Side, size: number, entryPrice: number): number
  getFundingRate(): number
  getPosition(id: string): Result<Position, PositionNotFound>
  listPositions(): Position[]
}

const fail = <E extends DomainError>(error: E): Result<never, E> => ({
  success: false,
  error,
})

const pnl = (
  side: Side,
  entryPrice: number,
  price: number,
  size: number,
): number => (price - entryPrice) * size * (side === Side.Long ? 1 : -1)

export class LiquidLayer {
  constructor(private readonly provider: LiquidityProvider) {}

  openPosition(
    side: Side,
    size: number,
    entryPrice: number,
  ): Result<Position, InsufficientMargin | InvalidSize | InvalidPrice> {
    if (size <= 0) {
      return fail({ type: 'InvalidSize', size })
    }
    if (entryPrice <= 0) {
      return fail({ type: 'InvalidPrice', price: entryPrice })
    }
    const requiredMargin = this.provider.getRequiredMargin(
      side,
      size,
      entryPrice,
    )
    const balance = this.provider.getCollateralBalance()
    if (balance < requiredMargin) {
      return fail({
        type: 'InsufficientMargin',
        required: requiredMargin,
        available: balance,
      })
    }
    return {
      success: true,
      value: this.provider.openPosition(side, size, entryPrice),
    }
  }

  closePosition(
    id: string,
    exitPrice: number,
  ): Result<
    { realizedPnl: number; position: Position },
    | PositionNotFound
    | InvalidPrice
    | PositionAlreadyClosed
    | InsufficientBalance
  > {
    const open = this.ensureClosable(id, exitPrice)
    if (!open.success) {
      return open
    }
    const current = open.value
    const provisionalPnl = pnl(
      current.side,
      current.entryPrice,
      exitPrice,
      current.size,
    )
    const balance = this.provider.getCollateralBalance()
    if (balance + provisionalPnl < 0) {
      return fail({
        type: 'InsufficientBalance',
        requested: -provisionalPnl,
        available: balance,
      })
    }
    return { success: true, value: this.closeAndSettle(current, id, exitPrice) }
  }

  private closeAndSettle(
    current: Position,
    id: string,
    exitPrice: number,
  ): { realizedPnl: number; position: Position } {
    const position = this.provider.closePosition(id, exitPrice)
    const realizedPnl = pnl(
      position.side,
      position.entryPrice,
      exitPrice,
      position.size,
    )
    this.provider.settlePnl(realizedPnl)
    return { realizedPnl, position }
  }

  private ensureClosable(
    id: string,
    price: number,
  ): Result<
    Position,
    InvalidPrice | PositionNotFound | PositionAlreadyClosed
  > {
    if (price <= 0) {
      return fail({ type: 'InvalidPrice', price })
    }
    const found = this.provider.getPosition(id)
    if (!found.success) {
      return found
    }
    if (found.value.exitPrice !== undefined) {
      return fail({ type: 'PositionAlreadyClosed', id })
    }
    return { success: true, value: found.value }
  }

  depositCollateral(amount: number): Result<number, InvalidAmount> {
    if (amount < 0) {
      return fail({ type: 'InvalidAmount', amount })
    }
    return { success: true, value: this.provider.depositCollateral(amount) }
  }

  withdrawCollateral(
    amount: number,
  ): Result<number, InsufficientBalance | InvalidAmount> {
    if (amount < 0) {
      return fail({ type: 'InvalidAmount', amount })
    }
    const balance = this.provider.getCollateralBalance()
    if (amount > balance) {
      return fail({
        type: 'InsufficientBalance',
        requested: amount,
        available: balance,
      })
    }
    return { success: true, value: this.provider.withdrawCollateral(amount) }
  }

  getCollateralBalance(): number {
    return this.provider.getCollateralBalance()
  }

  getPosition(id: string): Result<Position, PositionNotFound> {
    return this.provider.getPosition(id)
  }

  listPositions(): Position[] {
    return this.provider.listPositions()
  }

  getEquity(id: string, markPrice: number): Result<number, PositionNotFound> {
    const found = this.provider.getPosition(id)
    if (!found.success) {
      return found
    }
    return { success: true, value: this.equityOf(found.value, markPrice) }
  }

  private equityOf(position: Position, markPrice: number): number {
    return (
      this.provider.getCollateralBalance() +
      pnl(position.side, position.entryPrice, markPrice, position.size)
    )
  }

  checkLiquidation(
    id: string,
    markPrice: number,
  ): Result<
    { liquidated: boolean; exitPrice?: number; realizedPnl?: number },
    PositionNotFound | InvalidPrice | PositionAlreadyClosed
  > {
    const open = this.ensureClosable(id, markPrice)
    if (!open.success) {
      return open
    }
    const position = open.value
    const maintenance = this.provider.getMaintenanceMargin(
      position.side,
      position.size,
      position.entryPrice,
    )
    if (this.equityOf(position, markPrice) >= maintenance) {
      return { success: true, value: { liquidated: false } }
    }
    const { realizedPnl } = this.closeAndSettle(position, id, markPrice)
    return {
      success: true,
      value: { liquidated: true, exitPrice: markPrice, realizedPnl },
    }
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
