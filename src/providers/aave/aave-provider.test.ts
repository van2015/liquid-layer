import { describe, expect, it, vi } from 'vitest'
import { Side } from '../../liquid-layer'
import {
  reserveWethFixture,
  reserveBorrowDisabledFixture,
  reserveNotFoundFixture,
  userPositionsWithSupplyFixture,
  userNoPositionFixture,
  userPositionsWithWethDebtFixture,
  userPositionsWithWethSupplyFixture,
} from '../../test-support/aave-fixtures'
import { aTrade } from '../../test-support/trade-builder'
import { AaveProvider } from './aave-provider'
import type { FetchLike } from './graphql-client'
import { GRAPHQL_URL } from './types'

const MARKET = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const USER = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

function aProvider(fetchFn: FetchLike, user: string = USER): AaveProvider {
  return new AaveProvider({
    fetchFn,
    market: MARKET,
    underlyingToken: WETH,
    chainId: '1',
    user,
  })
}

describe('AaveProvider', () => {
  it('reads the required margin from the reserve max ltv', async () => {
    const fetchFn = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(JSON.stringify(reserveWethFixture), { status: 200 }),
    )
    const provider = aProvider(fetchFn)

    const result = await provider.getRequiredMargin(
      aTrade().long().size(2).entryPrice(40250).build(),
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value).toBeCloseTo(100000)
    }
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe(GRAPHQL_URL)
    const body = JSON.parse(String(init?.body)) as {
      query: string
      variables: Record<string, string>
    }
    expect(body.query).toContain('reserve(request:')
    expect(body.variables).toEqual({
      market: MARKET,
      underlyingToken: WETH,
      chainId: '1',
    })
  })

  it('reads the maintenance margin from the reserve liquidation threshold', async () => {
    const fetchFn = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(JSON.stringify(reserveWethFixture), { status: 200 }),
    )
    const provider = aProvider(fetchFn)

    const result = await provider.getMaintenanceMargin(
      aTrade().long().entryPrice(83000).build(),
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value).toBeCloseTo(100000)
    }
    const [, init] = fetchFn.mock.calls[0]!
    const body = JSON.parse(String(init?.body)) as { query: string }
    expect(body.query).toContain('liquidationThreshold { value }')
  })

  it('propagates an upstream failure when the reserve cannot be read', async () => {
    const fetchFn = vi.fn(
      async (): Promise<Response> =>
        new Response('internal error', { status: 500 }),
    )
    const provider = aProvider(fetchFn)

    const result = await provider.getRequiredMargin(
      aTrade().long().entryPrice(60000).build(),
    )

    expect(result).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'postGraphQL' },
    })
  })

  it('reads the funding rate from the reserve borrow apy', async () => {
    const fetchFn = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(JSON.stringify(reserveWethFixture), { status: 200 }),
    )
    const provider = aProvider(fetchFn)

    const result = await provider.getFundingRate()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value).toBeCloseTo(0.0198388, 6)
    }
    const [, init] = fetchFn.mock.calls[0]!
    const body = JSON.parse(String(init?.body)) as { query: string }
    expect(body.query).toContain('borrowInfo')
    expect(body.query).toContain('apy { value }')
  })

  it('returns an upstream failure when borrowing is disabled on the reserve', async () => {
    const fetchFn = vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify(reserveBorrowDisabledFixture), {
          status: 200,
        }),
    )
    const provider = aProvider(fetchFn)

    const result = await provider.getFundingRate()

    expect(result).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'postGraphQL' },
    })
  })

  it('returns an upstream failure when the reserve is not found', async () => {
    const fetchFn = vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify(reserveNotFoundFixture), { status: 200 }),
    )
    const provider = aProvider(fetchFn)

    const result = await provider.getRequiredMargin(
      aTrade().long().entryPrice(60000).build(),
    )

    expect(result).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'postGraphQL' },
    })
  })

  it('reads the collateral balance from the user supplies of the reserve', async () => {
    const fetchFn = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(JSON.stringify(userPositionsWithSupplyFixture), {
          status: 200,
        }),
    )
    const provider = aProvider(fetchFn)

    const result = await provider.getCollateralBalance()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value).toBeCloseTo(0.000074432272270623, 15)
    }
    const [, init] = fetchFn.mock.calls[0]!
    const body = JSON.parse(String(init?.body)) as {
      query: string
      variables: Record<string, unknown>
    }
    expect(body.query).toContain('userSupplies')
    expect(body.query).toContain('borrows:')
    expect(body.variables).toEqual({
      market: { address: MARKET, chainId: '1' },
      user: USER,
    })
  })

  it('returns zero collateral when the user has no position on the reserve', async () => {
    const fetchFn = vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify(userNoPositionFixture), { status: 200 }),
    )
    const provider = aProvider(fetchFn)

    const result = await provider.getCollateralBalance()

    expect(result).toEqual({ success: true, value: 0 })
  })

  it('returns an upstream failure when the positions payload has no data', async () => {
    const fetchFn = vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify(reserveNotFoundFixture), { status: 200 }),
    )
    const provider = aProvider(fetchFn)

    const result = await provider.getCollateralBalance()

    expect(result).toEqual({
      success: false,
      error: { type: 'UpstreamFailure', operation: 'postGraphQL' },
    })
  })

  it('reads a long position from the user borrow of the reserve', async () => {
    const fetchFn = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(JSON.stringify(userPositionsWithWethDebtFixture), {
          status: 200,
        }),
    )
    const provider = aProvider(
      fetchFn,
      '0x772439Ea39a64340DcD348618C15a483D0db4c18',
    )
    const positionId = `1:${MARKET}:${WETH}`

    const result = await provider.getPosition(positionId)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value.id).toBe(positionId)
      expect(result.value.side).toBe(Side.Long)
      expect(result.value.size).toBeCloseTo(0.025294505537082373, 15)
      expect(result.value.entryPrice).toBeCloseTo(2717.27, 1)
      expect(result.value.exitPrice).toBeUndefined()
    }
  })

  it('reads a short position from the user supply of the reserve', async () => {
    const fetchFn = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(JSON.stringify(userPositionsWithWethSupplyFixture), {
          status: 200,
        }),
    )
    const provider = aProvider(
      fetchFn,
      '0x3FCA83e0Dec167f1348CB01c7dF5437F9ff6EBE6',
    )
    const positionId = `1:${MARKET}:${WETH}`

    const result = await provider.getPosition(positionId)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value.id).toBe(positionId)
      expect(result.value.side).toBe(Side.Short)
      expect(result.value.size).toBeCloseTo(26.512887202828885925, 15)
      expect(result.value.entryPrice).toBeCloseTo(2705.73686116, 6)
      expect(result.value.exitPrice).toBeUndefined()
    }
  })

  it('returns position not found when the id does not match the reserve', async () => {
    const fetchFn = vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify(userPositionsWithWethDebtFixture), {
          status: 200,
        }),
    )
    const provider = aProvider(
      fetchFn,
      '0x772439Ea39a64340DcD348618C15a483D0db4c18',
    )

    const result = await provider.getPosition('99:wrong:address')

    expect(result).toEqual({
      success: false,
      error: { type: 'PositionNotFound', id: '99:wrong:address' },
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns position not found when the user has no position on the reserve', async () => {
    const fetchFn = vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify(userNoPositionFixture), { status: 200 }),
    )
    const provider = aProvider(fetchFn)
    const positionId = `1:${MARKET}:${WETH}`

    const result = await provider.getPosition(positionId)

    expect(result).toEqual({
      success: false,
      error: { type: 'PositionNotFound', id: positionId },
    })
  })

  it('lists the current reserve position as a single entry', async () => {
    const fetchFn = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(JSON.stringify(userPositionsWithWethDebtFixture), {
          status: 200,
        }),
    )
    const provider = aProvider(
      fetchFn,
      '0x772439Ea39a64340DcD348618C15a483D0db4c18',
    )
    const positionId = `1:${MARKET}:${WETH}`

    const result = await provider.listPositions()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value).toHaveLength(1)
      const [position] = result.value
      expect(position.id).toBe(positionId)
      expect(position.side).toBe(Side.Long)
      expect(position.size).toBeCloseTo(0.025294505537082373, 15)
      expect(position.entryPrice).toBeCloseTo(2717.27, 1)
      expect(position.exitPrice).toBeUndefined()
    }
  })

  it('lists an empty list when the user has no position', async () => {
    const fetchFn = vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify(userNoPositionFixture), { status: 200 }),
    )
    const provider = aProvider(fetchFn)

    const result = await provider.listPositions()

    expect(result).toEqual({ success: true, value: [] })
  })

  it('settles pnl as a no-op without preparing a transaction', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> => {
      throw new Error('network should not be called')
    })
    const provider = aProvider(fetchFn)

    const result = await provider.settlePnl(12.5)

    expect(result).toEqual({ success: true, value: undefined })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('settles funding as a no-op without preparing a transaction', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> => {
      throw new Error('network should not be called')
    })
    const provider = aProvider(fetchFn)

    const result = await provider.settleFunding(0.42)

    expect(result).toEqual({ success: true, value: undefined })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
