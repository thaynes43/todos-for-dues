// Minimal in-repo shim for the subset of `next/navigation` + redirect-error
// surface that `apps/web/app/signup/actions.ts` touches at runtime.
//
// The @app/auth package does NOT depend on `next` (and shouldn't — it's a pure
// Node-side concern). When the signup-flow integration test imports
// `signupWithInviteToken` via a relative path, Vitest needs `next/navigation`
// and `next/dist/client/components/redirect-error` resolvable. We alias both
// modules to this shim via `vitest.config.ts`.
//
// `redirect()` matches Next's behavior of throwing an error tagged with a
// known digest prefix; `isRedirectError` recognizes that prefix. The action's
// happy path calls `redirect('/')`, so the test wraps the call in try/catch
// and uses `isRedirectError` to swallow the expected throw.

const REDIRECT_ERROR_CODE = 'NEXT_REDIRECT';

export class RedirectError extends Error {
  digest: string;
  constructor(url: string) {
    super(`${REDIRECT_ERROR_CODE};replace;${url};307;`);
    this.digest = `${REDIRECT_ERROR_CODE};replace;${url};307;`;
    this.name = 'RedirectError';
  }
}

export function redirect(url: string): never {
  throw new RedirectError(url);
}

export function isRedirectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const digest = (err as unknown as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith(REDIRECT_ERROR_CODE);
}
