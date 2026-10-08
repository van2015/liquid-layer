export const GRAPHQL_URL = 'https://api.v3.aave.com/graphql'

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
