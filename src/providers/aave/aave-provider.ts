import {
  Side,
  type Position,
  type PositionNotFound,
  type Result,
  type Trade,
  type UpstreamFailure,
} from '../../liquid-layer'
import { postGraphQL, type FetchLike } from './graphql-client'
import { GRAPHQL_URL } from './types'

const RESERVE_QUERY = `query Reserve($market: EvmAddress!, $underlyingToken: EvmAddress!, $chainId: ChainId!) {
  reserve(request: {market: $market, underlyingToken: $underlyingToken, chainId: $chainId}) {
    supplyInfo {
      maxLTV { value }
      liquidationThreshold { value }
      apy { value }
    }
    borrowInfo {
      apy { value }
    }
  }
}`

interface ReserveResponse {
  reserve: ReserveData | null
}

type ReserveData = {
  supplyInfo: {
    maxLTV: { value: string }
    liquidationThreshold: { value: string }
    apy: { value: string }
  }
  borrowInfo: { apy: { value: string } } | null
}

const USER_POSITIONS_QUERY = `query UserPositions($market: MarketInput!, $user: EvmAddress!) {
  borrows: userBorrows(request: {markets: [$market], user: $user, orderBy: {debt: DESC}}) {
    currency { address symbol decimals }
    debt { amount { value } usd }
  }
  supplies: userSupplies(request: {markets: [$market], user: $user, collateralsOnly: false, orderBy: {name: ASC}}) {
    currency { address symbol decimals }
    balance { amount { value } usd usdPerToken }
    isCollateral
  }
}`

interface UserPositionsResponse {
  borrows: Array<{
    currency: { address: string }
    debt: { amount: { value: string }; usd: string }
  }>
  supplies: Array<{
    currency: { address: string }
    balance: { amount: { value: string }; usdPerToken: string }
    isCollateral: boolean
  }>
}

function upstreamFailure(): UpstreamFailure {
  return { type: 'UpstreamFailure', operation: 'postGraphQL' }
}

export interface AaveProviderConfig {
  fetchFn: FetchLike
  market: string
  underlyingToken: string
  chainId: string
  user: string
}

export class AaveProvider {
  constructor(private readonly config: AaveProviderConfig) {}

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
      return {
        success: false,
        error: upstreamFailure(),
      }
    }
    return { success: true, value: response.value.reserve }
  }

  async getRequiredMargin(
    trade: Trade,
  ): Promise<Result<number, UpstreamFailure>> {
    const reserve = await this.reserve()
    if (!reserve.success) {
      return reserve
    }
    const maxLTV = parseFloat(reserve.value.supplyInfo.maxLTV.value)
    return {
      success: true,
      value: (trade.size * trade.entryPrice) / maxLTV,
    }
  }

  async getMaintenanceMargin(
    trade: Trade,
  ): Promise<Result<number, UpstreamFailure>> {
    const reserve = await this.reserve()
    if (!reserve.success) {
      return reserve
    }
    const threshold = parseFloat(reserve.value.supplyInfo.liquidationThreshold.value)
    return {
      success: true,
      value: (trade.size * trade.entryPrice) / threshold,
    }
  }

  async getFundingRate(
    side: Side,
    size: number,
    entryPrice: number,
  ): Promise<Result<number, UpstreamFailure>> {
    const reserve = await this.reserve()
    if (!reserve.success) {
      return reserve
    }
    const borrowInfo = reserve.value.borrowInfo
    if (borrowInfo === null) {
      return {
        success: false,
        error: upstreamFailure(),
      }
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
        entry.currency.address.toLowerCase() ===
          this.config.underlyingToken.toLowerCase() && entry.isCollateral,
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
      return {
        success: false,
        error: upstreamFailure(),
      }
    }
    return response
  }

  private positionId(): string {
    return `${this.config.chainId}:${this.config.market}:${this.config.underlyingToken}`
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
    const borrow = positions.value.borrows.find(
      (entry) =>
        entry.currency.address.toLowerCase() ===
        this.config.underlyingToken.toLowerCase(),
    )
    if (borrow !== undefined) {
      const size = parseFloat(borrow.debt.amount.value)
      return {
        success: true,
        value: {
          id: this.positionId(),
          side: Side.Long,
          size,
          entryPrice: parseFloat(borrow.debt.usd) / size,
          exitPrice: undefined,
        },
      }
    }
    const supply = positions.value.supplies.find(
      (entry) =>
        entry.currency.address.toLowerCase() ===
        this.config.underlyingToken.toLowerCase(),
    )
    if (supply !== undefined) {
      return {
        success: true,
        value: {
          id: this.positionId(),
          side: Side.Short,
          size: parseFloat(supply.balance.amount.value),
          entryPrice: parseFloat(supply.balance.usdPerToken),
          exitPrice: undefined,
        },
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

  async settlePnl(_amount: number): Promise<Result<void, UpstreamFailure>> {
    return { success: true, value: undefined }
  }

  async settleFunding(_amount: number): Promise<Result<void, UpstreamFailure>> {
    return { success: true, value: undefined }
  }
}
