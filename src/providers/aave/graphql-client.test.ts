import { describe, expect, it, vi } from 'vitest'
import { postGraphQL } from './graphql-client'
import { GRAPHQL_URL } from './types'

describe('postGraphQL', () => {
  it('posts a graphql query and unwraps the data field', async () => {
    const fetchFn = vi.fn(
      async (
        _input: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> =>
        new Response(
          JSON.stringify({ data: { reserves: [{ symbol: 'USDC' }] } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    const query = 'query Reserves($first: Int) { reserves(first: $first) { symbol } }'

    const result = await postGraphQL<{ reserves: { symbol: string }[] }>(
      fetchFn,
      GRAPHQL_URL,
      query,
      { first: 10 },
    )

    expect(result).toEqual({
      success: true,
      value: { reserves: [{ symbol: 'USDC' }] },
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe(GRAPHQL_URL)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      query,
      variables: { first: 10 },
    })
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'application/json',
    )
  })
})
