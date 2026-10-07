export const RESERVE_QUERY = `query Reserve($market: EvmAddress!, $underlyingToken: EvmAddress!, $chainId: ChainId!) {
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

export interface ReserveResponse {
  reserve: ReserveData | null
}

export type ReserveData = {
  supplyInfo: {
    maxLTV: { value: string }
    liquidationThreshold: { value: string }
    apy: { value: string }
  }
  borrowInfo: { apy: { value: string } } | null
}

export const USER_POSITIONS_QUERY = `query UserPositions($market: MarketInput!, $user: EvmAddress!) {
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

export interface UserPositionsResponse {
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

export const SUPPLY_MUTATION = `mutation Supply($market: EvmAddress!, $underlyingToken: EvmAddress!, $chainId: ChainId!, $user: EvmAddress!, $amount: AmountAmount!) {
  supply(request: {market: $market, underlyingToken: $underlyingToken, chainId: $chainId, user: $user, amount: $amount}) {
    to
    data
    value
  }
}`

export interface SupplyResponse {
  supply: {
    to: string
    data: string
    value: string
  } | null
}

export const WITHDRAW_MUTATION = `mutation Withdraw($market: EvmAddress!, $underlyingToken: EvmAddress!, $chainId: ChainId!, $user: EvmAddress!, $amount: AmountAmount!) {
  withdraw(request: {market: $market, underlyingToken: $underlyingToken, chainId: $chainId, user: $user, amount: $amount}) {
    to
    data
    value
  }
}`

export interface WithdrawResponse {
  withdraw: {
    to: string
    data: string
    value: string
  } | null
}
