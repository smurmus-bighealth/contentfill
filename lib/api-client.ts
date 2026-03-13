/**
 * Client-side fetch helper.
 *
 * In OAuth mode, authentication is handled via the NextAuth session cookie —
 * no explicit header is needed. On a 401 (expired/invalid session), the user
 * is redirected to the login page.
 *
 * In local/simple mode, the optional admin secret is still attached via header
 * (stored in sessionStorage under 'admin-secret').
 */

function getAdminHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const secret = sessionStorage.getItem('admin-secret');
  return secret ? { 'x-admin-secret': secret } : {};
}

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
      ...getAdminHeaders(),
      ...(isJson && { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    // In OAuth mode: session expired or invalid — redirect to login.
    // In local mode: admin secret was wrong — clear it from storage.
    sessionStorage.removeItem('admin-secret');
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError('Session expired. Redirecting to login…', 401);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data?.error ?? `HTTP ${response.status}`, response.status);
  }

  return data as T;
}
