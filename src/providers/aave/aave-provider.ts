import type { Result, Side, UpstreamFailure } from '../../liquid-layer'
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

export interface AaveProviderConfig {
  fetchFn: FetchLike
  market: string
  underlyingToken: string
  chainId: string
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
        error: { type: 'UpstreamFailure', operation: 'postGraphQL' },
      }
    }
    return { success: true, value: response.value.reserve }
  }

  async getRequiredMargin(
    side: Side,
    size: number,
    entryPrice: number,
  ): Promise<Result<number, UpstreamFailure>> {
    const reserve = await this.reserve()
    if (!reserve.success) {
      return reserve
    }
    const maxLTV = parseFloat(reserve.value.supplyInfo.maxLTV.value)
    return { success: true, value: (size * entryPrice) / maxLTV }
  }

  async getMaintenanceMargin(
    side: Side,
    size: number,
    entryPrice: number,
  ): Promise<Result<number, UpstreamFailure>> {
    const reserve = await this.reserve()
    if (!reserve.success) {
      return reserve
    }
    const threshold = parseFloat(reserve.value.supplyInfo.liquidationThreshold.value)
    return { success: true, value: (size * entryPrice) / threshold }
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
        error: { type: 'UpstreamFailure', operation: 'postGraphQL' },
      }
    }
    return { success: true, value: parseFloat(borrowInfo.apy.value) }
  }
}
