import type { Result, UpstreamFailure } from '../../liquid-layer'

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export async function postGraphQL<T>(
  fetchFn: FetchLike,
  url: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Result<T, UpstreamFailure>> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const body: unknown = await response.json()
  return { success: true, value: (body as { data: T }).data }
}
