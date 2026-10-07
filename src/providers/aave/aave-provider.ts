import {
  Side,
  type InvalidAmount,
  type Position,
  type PositionNotFound,
  type Result,
  type Trade,
  type TransactionRequest,
  type UpstreamFailure,
} from '../../liquid-layer'
import {
  postGraphQL,
  upstreamFailure,
  type FetchLike,
} from './graphql-client'
import { GRAPHQL_URL } from './types'
import {
  RESERVE_QUERY,
  SUPPLY_MUTATION,
  USER_POSITIONS_QUERY,
  type ReserveData,
  type ReserveResponse,
  type SupplyResponse,
  type UserPositionsResponse,
} from './queries'

export interface AaveProviderConfig {
  fetchFn: FetchLike
  market: string
  underlyingToken: string
  chainId: string
  user: string
}

export class AaveProvider {
  private readonly underlyingTokenKey: string

  constructor(private readonly config: AaveProviderConfig) {
    this.underlyingTokenKey = config.underlyingToken.toLowerCase()
  }

  private matchesUnderlyingToken(address: string): boolean {
    return address.toLowerCase() === this.underlyingTokenKey
  }

  private upstream(): Result<never, UpstreamFailure> {
    return { success: false, error: upstreamFailure() }
  }

  private async reserve(): Promise<Result<ReserveData, UpstreamFailure>> {
    const response = await postGraphQL<ReserveResponse>(
      this.config.fetchFn,
      GRAPHQL_URL,
      RESERVE_QUERY,
      {
        market: this.config.market,
        underlyingToken: this.config.underlyingToken,
        chainId: this.config.chainId,
      },
    )
    if (!response.success) {
      return response
    }
    if (response.value.reserve === null) {
      return this.upstream()
    }
    return { success: true, value: response.value.reserve }
  }

  async getRequiredMargin(
    trade: Trade,
  ): Promise<Result<number, UpstreamFailure>> {
    return this.margin(trade, 'maxLTV')
  }

  async getMaintenanceMargin(
    trade: Trade,
  ): Promise<Result<number, UpstreamFailure>> {
    return this.margin(trade, 'liquidationThreshold')
  }

  private async margin(
    trade: Trade,
    ratioField: 'maxLTV' | 'liquidationThreshold',
  ): Promise<Result<number, UpstreamFailure>> {
    const reserve = await this.reserve()
    if (!reserve.success) {
      return reserve
    }
    const ratio = parseFloat(reserve.value.supplyInfo[ratioField].value)
    return {
      success: true,
      value: (trade.size * trade.entryPrice) / ratio,
    }
  }

  async getFundingRate(): Promise<Result<number, UpstreamFailure>> {
    const reserve = await this.reserve()
    if (!reserve.success) {
      return reserve
    }
    const borrowInfo = reserve.value.borrowInfo
    if (borrowInfo === null) {
      return this.upstream()
    }
    return { success: true, value: parseFloat(borrowInfo.apy.value) }
  }

  async getCollateralBalance(): Promise<Result<number, UpstreamFailure>> {
    const positions = await this.positions()
    if (!positions.success) {
      return positions
    }
    const supply = positions.value.supplies.find(
      (entry) =>
        this.matchesUnderlyingToken(entry.currency.address) &&
        entry.isCollateral,
    )
    if (supply === undefined) {
      return { success: true, value: 0 }
    }
    return { success: true, value: parseFloat(supply.balance.amount.value) }
  }

  private async positions(): Promise<Result<UserPositionsResponse, UpstreamFailure>> {
    const response = await postGraphQL<UserPositionsResponse>(
      this.config.fetchFn,
      GRAPHQL_URL,
      USER_POSITIONS_QUERY,
      {
        market: {
          address: this.config.market,
          chainId: this.config.chainId,
        },
        user: this.config.user,
      },
    )
    if (!response.success) {
      return response
    }
    if (!Array.isArray(response.value.supplies)) {
      return this.upstream()
    }
    return response
  }

  private positionId(): string {
    return `${this.config.chainId}:${this.config.market}:${this.config.underlyingToken}`
  }

  private positionFrom(
    side: Side,
    size: number,
    entryPrice: number,
  ): Position {
    return {
      id: this.positionId(),
      side,
      size,
      entryPrice,
      exitPrice: undefined,
    }
  }

  async getPosition(
    id: string,
  ): Promise<Result<Position, PositionNotFound | UpstreamFailure>> {
    if (id !== this.positionId()) {
      return { success: false, error: { type: 'PositionNotFound', id } }
    }
    const positions = await this.positions()
    if (!positions.success) {
      return positions
    }
    const borrow = positions.value.borrows.find((entry) =>
      this.matchesUnderlyingToken(entry.currency.address),
    )
    if (borrow !== undefined) {
      const size = parseFloat(borrow.debt.amount.value)
      return {
        success: true,
        value: this.positionFrom(
          Side.Long,
          size,
          parseFloat(borrow.debt.usd) / size,
        ),
      }
    }
    const supply = positions.value.supplies.find((entry) =>
      this.matchesUnderlyingToken(entry.currency.address),
    )
    if (supply !== undefined) {
      return {
        success: true,
        value: this.positionFrom(
          Side.Short,
          parseFloat(supply.balance.amount.value),
          parseFloat(supply.balance.usdPerToken),
        ),
      }
    }
    return { success: false, error: { type: 'PositionNotFound', id } }
  }

  async listPositions(): Promise<Result<Position[], UpstreamFailure>> {
    const position = await this.getPosition(this.positionId())
    if (!position.success) {
      if (position.error.type === 'PositionNotFound') {
        return { success: true, value: [] }
      }
      return { success: false, error: position.error }
    }
    return { success: true, value: [position.value] }
  }

  async depositCollateral(
    amount: number,
  ): Promise<Result<TransactionRequest, InvalidAmount | UpstreamFailure>> {
    if (amount < 0) {
      return { success: false, error: { type: 'InvalidAmount', amount } }
    }
    const response = await postGraphQL<SupplyResponse>(
      this.config.fetchFn,
      GRAPHQL_URL,
      SUPPLY_MUTATION,
      {
        market: this.config.market,
        underlyingToken: this.config.underlyingToken,
        chainId: this.config.chainId,
        user: this.config.user,
        amount: String(amount),
      },
    )
    if (!response.success) {
      return response
    }
    if (response.value.supply === null) {
      return this.upstream()
    }
    return { success: true, value: response.value.supply }
  }

  async settlePnl(_amount: number): Promise<Result<void, UpstreamFailure>> {
    return { success: true, value: undefined }
  }

  async settleFunding(_amount: number): Promise<Result<void, UpstreamFailure>> {
    return { success: true, value: undefined }
  }
}
