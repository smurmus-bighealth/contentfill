/**
 * Client-side fetch helper.
 *
 * Authentication is handled via the NextAuth session cookie in OAuth mode,
 * or implicitly via the server-side management token in local dev — no
 * explicit auth header is attached here. On a 401, the user is redirected
 * to the login page (OAuth mode) or sees an error (local dev misconfiguration).
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = options;
  const isJson = json !== undefined;

  const response = await fetch(url, {
    ...rest,
    ...(isJson && { body: JSON.stringify(json) }),
    headers: {
      ...(isJson && { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError('Session expired. Redirecting to login…', 401);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(`Server error (HTTP ${response.status})`, response.status);
    }
    throw new ApiError('Unexpected non-JSON response from server', response.status);
  }

  if (!response.ok) {
    const msg = (data as Record<string, unknown>)?.error;
    throw new ApiError(typeof msg === 'string' ? msg : `HTTP ${response.status}`, response.status);
  }

  return data as T;
}
