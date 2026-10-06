import type { Result, UpstreamFailure } from '../../liquid-layer'

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

function graphQLFailure(): UpstreamFailure {
  return { type: 'UpstreamFailure', operation: 'postGraphQL' }
}

export async function postGraphQL<T>(
  fetchFn: FetchLike,
  url: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Result<T, UpstreamFailure>> {
  let response: Response
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
  } catch {
    return { success: false, error: graphQLFailure() }
  }
  if (!response.ok) {
    return { success: false, error: graphQLFailure() }
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { success: false, error: graphQLFailure() }
  }
  return { success: true, value: (body as { data: T }).data }
}
