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

const TX_BASE_VARIABLES =
  '$market: EvmAddress!, $underlyingToken: EvmAddress!, $chainId: ChainId!, $user: EvmAddress!'

const TX_AMOUNT_VARIABLE = '$amount: AmountAmount!'

const TX_REQUEST_BASE =
  'market: $market, underlyingToken: $underlyingToken, chainId: $chainId, user: $user'

const TX_AMOUNT_FIELD = 'amount: $amount'

const TX_FIELDS = `to
    data
    value`

export const SUPPLY_MUTATION = `mutation Supply(${TX_BASE_VARIABLES}, ${TX_AMOUNT_VARIABLE}) {
  supply(request: {${TX_REQUEST_BASE}, ${TX_AMOUNT_FIELD}}) {
    ${TX_FIELDS}
  }
}`

export const WITHDRAW_MUTATION = `mutation Withdraw(${TX_BASE_VARIABLES}, ${TX_AMOUNT_VARIABLE}) {
  withdraw(request: {${TX_REQUEST_BASE}, ${TX_AMOUNT_FIELD}}) {
    ${TX_FIELDS}
  }
}`

export const OPEN_POSITION_MUTATION = `mutation OpenPosition(${TX_BASE_VARIABLES}, $side: Side!, ${TX_AMOUNT_VARIABLE}) {
  openPosition(request: {${TX_REQUEST_BASE}, side: $side, ${TX_AMOUNT_FIELD}}) {
    ${TX_FIELDS}
  }
}`

export const CLOSE_POSITION_MUTATION = `mutation ClosePosition(${TX_BASE_VARIABLES}, $side: Side!, $id: String!, $exitPrice: AmountAmount!, ${TX_AMOUNT_VARIABLE}) {
  closePosition(request: {${TX_REQUEST_BASE}, side: $side, id: $id, exitPrice: $exitPrice, ${TX_AMOUNT_FIELD}}) {
    ${TX_FIELDS}
  }
}`
