/**
 * Request auth check for API routes.
 *
 * For local development (the primary use case), ADMIN_SECRET is not set and
 * all requests are allowed — the Contentful Management Token in .env is the
 * real credential gate.
 *
 * Set ADMIN_SECRET only if you deploy this app to a public URL and want to
 * prevent unauthorized access to the UI.
 */
export function checkAuth(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true; // local dev: open
  return request.headers.get('x-admin-secret') === secret;
}
