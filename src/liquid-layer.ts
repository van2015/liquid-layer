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

export type UpstreamFailure = {
  readonly type: 'UpstreamFailure'
  readonly operation: string
}

export type OpenError = PositionNotFound | PositionAlreadyClosed | UpstreamFailure

export type PricedOpenError = InvalidPrice | OpenError

export type OpenPositionError =
  | InsufficientMargin
  | InvalidSize
  | InvalidPrice
  | UpstreamFailure

export type Result<T, E extends DomainError> =
  | { success: true; value: T }
  | { success: false; error: E }

export type TransactionRequest = {
  to: string
  data: string
  value: string
}

export interface Position {
  id: string
  side: Side
  size: number
  entryPrice: number
  exitPrice?: number
}

export interface Trade {
  side: Side
  size: number
  entryPrice: number
}

export interface LiquidityProvider {
  openPosition(
    trade: Trade,
  ): Promise<
    Result<
      TransactionRequest,
      OpenPositionError
    >
  >
  closePosition(
    id: string,
    exitPrice: number,
  ): Promise<
    Result<
      TransactionRequest,
      OpenError
    >
  >
  depositCollateral(
    amount: number,
  ): Promise<Result<TransactionRequest, InvalidAmount | UpstreamFailure>>
  withdrawCollateral(
    amount: number,
  ): Promise<
    Result<
      TransactionRequest,
      InsufficientBalance | InvalidAmount | UpstreamFailure
    >
  >
  settlePnl(amount: number): Promise<Result<void, UpstreamFailure>>
  settleFunding(amount: number): Promise<Result<void, UpstreamFailure>>
  getCollateralBalance(): Promise<Result<Money, UpstreamFailure>>
  getRequiredMargin(trade: Trade): Promise<Result<Money, UpstreamFailure>>
  getMaintenanceMargin(trade: Trade): Promise<Result<Money, UpstreamFailure>>
  getFundingRate(): Promise<Result<number, UpstreamFailure>>
  getPosition(
    id: string,
  ): Promise<Result<Position, PositionNotFound | UpstreamFailure>>
  listPositions(): Promise<Result<Position[], UpstreamFailure>>
}

const fail = <E extends DomainError>(error: E): Result<never, E> => ({
  success: false,
  error,
})

const pnl = (position: Position, price: number): number =>
  (price - position.entryPrice) *
  position.size *
  (position.side === Side.Long ? 1 : -1)

export class LiquidLayer {
  constructor(private readonly provider: LiquidityProvider) {}

  async openPosition(trade: Trade): Promise<
    Result<
      TransactionRequest,
      OpenPositionError
    >
  > {
    if (trade.size <= 0) {
      return fail({ type: 'InvalidSize', size: trade.size })
    }
    if (trade.entryPrice <= 0) {
      return fail({ type: 'InvalidPrice', price: trade.entryPrice })
    }
    const requiredMargin = await this.provider.getRequiredMargin(trade)
    if (!requiredMargin.success) {
      return requiredMargin
    }
    const balance = await this.provider.getCollateralBalance()
    if (!balance.success) {
      return balance
    }
    if (balance.value < requiredMargin.value) {
      return fail({
        type: 'InsufficientMargin',
        required: requiredMargin.value,
        available: balance.value,
      })
    }
    return this.provider.openPosition(trade)
  }

  async closePosition(
    id: string,
    exitPrice: number,
  ): Promise<
    Result<
      TransactionRequest,
      | PositionNotFound
      | InvalidPrice
      | PositionAlreadyClosed
      | InsufficientBalance
      | UpstreamFailure
    >
  > {
    const open = await this.ensurePricedOpen(id, exitPrice)
    if (!open.success) {
      return open
    }
    const current = open.value
    const provisionalPnl = pnl(current, exitPrice)
    const balance = await this.provider.getCollateralBalance()
    if (!balance.success) {
      return balance
    }
    if (balance.value + provisionalPnl < 0) {
      return fail({
        type: 'InsufficientBalance',
        requested: -provisionalPnl,
        available: balance.value,
      })
    }
    return this.closeAndSettle(id, exitPrice, provisionalPnl)
  }

  private async closeAndSettle(
    id: string,
    exitPrice: number,
    realizedPnl: number,
  ): Promise<
    Result<
      TransactionRequest,
      OpenError
    >
  > {
    const closed = await this.provider.closePosition(id, exitPrice)
    if (!closed.success) {
      return closed
    }
    const settled = await this.provider.settlePnl(realizedPnl)
    if (!settled.success) {
      return settled
    }
    return closed
  }

  private async ensureOpen(
    id: string,
  ): Promise<
    Result<
      Position,
      OpenError
    >
  > {
    const found = await this.provider.getPosition(id)
    if (!found.success) {
      return found
    }
    if (found.value.exitPrice !== undefined) {
      return fail({ type: 'PositionAlreadyClosed', id })
    }
    return { success: true, value: found.value }
  }

  private async ensurePricedOpen(
    id: string,
    price: number,
  ): Promise<
    Result<
      Position,
      PricedOpenError
    >
  > {
    if (price <= 0) {
      return fail({ type: 'InvalidPrice', price })
    }
    return this.ensureOpen(id)
  }

  async depositCollateral(
    amount: number,
  ): Promise<Result<TransactionRequest, InvalidAmount | UpstreamFailure>> {
    if (amount < 0) {
      return fail({ type: 'InvalidAmount', amount })
    }
    return this.provider.depositCollateral(amount)
  }

  async withdrawCollateral(
    amount: number,
  ): Promise<
    Result<
      TransactionRequest,
      InsufficientBalance | InvalidAmount | UpstreamFailure
    >
  > {
    if (amount < 0) {
      return fail({ type: 'InvalidAmount', amount })
    }
    const balance = await this.provider.getCollateralBalance()
    if (!balance.success) {
      return balance
    }
    if (amount > balance.value) {
      return fail({
        type: 'InsufficientBalance',
        requested: amount,
        available: balance.value,
      })
    }
    return this.provider.withdrawCollateral(amount)
  }

  async getCollateralBalance(): Promise<Result<Money, UpstreamFailure>> {
    return this.provider.getCollateralBalance()
  }

  async getPosition(
    id: string,
  ): Promise<Result<Position, PositionNotFound | UpstreamFailure>> {
    return this.provider.getPosition(id)
  }

  async listPositions(): Promise<Result<Position[], UpstreamFailure>> {
    const listed = await this.provider.listPositions()
    if (!listed.success) {
      return listed
    }
    return {
      success: true,
      value: listed.value.filter(
        (position) => position.exitPrice === undefined,
      ),
    }
  }

  async getEquity(
    id: string,
    markPrice: number,
  ): Promise<
    Result<
      number,
      PricedOpenError
    >
  > {
    const open = await this.ensurePricedOpen(id, markPrice)
    if (!open.success) {
      return open
    }
    return this.equityOf(open.value, markPrice)
  }

  private async equityOf(
    position: Position,
    markPrice: number,
  ): Promise<Result<number, UpstreamFailure>> {
    const balance = await this.provider.getCollateralBalance()
    if (!balance.success) {
      return balance
    }
    return {
      success: true,
      value:
        balance.value +
        pnl(position, markPrice),
    }
  }

  private async marginCovered(
    position: Position,
    markPrice: number,
  ): Promise<Result<boolean, UpstreamFailure>> {
    const maintenance = await this.provider.getMaintenanceMargin({
      side: position.side,
      size: position.size,
      entryPrice: position.entryPrice,
    })
    if (!maintenance.success) {
      return maintenance
    }
    const equity = await this.equityOf(position, markPrice)
    if (!equity.success) {
      return equity
    }
    return { success: true, value: equity.value >= maintenance.value }
  }

  async checkLiquidation(
    id: string,
    markPrice: number,
  ): Promise<
    Result<
      {
        liquidated: boolean
        exitPrice?: number
        realizedPnl?: number
        tx?: TransactionRequest
      },
      PricedOpenError
    >
  > {
    const open = await this.ensurePricedOpen(id, markPrice)
    if (!open.success) {
      return open
    }
    const position = open.value
    const covered = await this.marginCovered(position, markPrice)
    if (!covered.success) {
      return covered
    }
    if (covered.value) {
      return { success: true, value: { liquidated: false } }
    }
    const realizedPnl = pnl(position, markPrice)
    const settled = await this.closeAndSettle(id, markPrice, realizedPnl)
    if (!settled.success) {
      return settled
    }
    return {
      success: true,
      value: {
        liquidated: true,
        exitPrice: markPrice,
        realizedPnl,
        tx: settled.value,
      },
    }
  }

  async payFunding(
    id: string,
  ): Promise<
    Result<void, OpenError>
  > {
    const open = await this.ensureOpen(id)
    if (!open.success) {
      return open
    }
    const rate = await this.provider.getFundingRate()
    if (!rate.success) {
      return rate
    }
    const { size, entryPrice, side } = open.value
    const amount = size * entryPrice * rate.value
    const settled = await this.provider.settleFunding(
      side === Side.Long ? -amount : amount,
    )
    if (!settled.success) {
      return settled
    }
    return { success: true, value: undefined }
  }
}
