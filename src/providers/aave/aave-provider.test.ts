import { describe, expect, it, vi } from 'vitest'
import { Side } from '../../liquid-layer'
import { reserveWethFixture } from '../../test-support/aave-fixtures'
import { AaveProvider } from './aave-provider'
import { GRAPHQL_URL } from './types'

const MARKET = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

describe('AaveProvider', () => {
  it('reads the required margin from the reserve max ltv', async () => {
    const fetchFn = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(JSON.stringify(reserveWethFixture), { status: 200 }),
    )
    const provider = new AaveProvider({
      fetchFn,
      market: MARKET,
      underlyingToken: WETH,
      chainId: '1',
    })

    const result = await provider.getRequiredMargin(Side.Long, 2, 40250)

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
})
