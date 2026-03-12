/**
 * Client-side fetch helper.
 * Attaches the admin secret header when set (deployed mode only).
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
    sessionStorage.removeItem('admin-secret');
    throw new ApiError('Unauthorized — check your Admin Secret.', 401);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data?.error ?? `HTTP ${response.status}`, response.status);
  }

  return data as T;
}
