const APP_ROOT = "/";
const PLACEHOLDER_ORIGIN = "https://return-to.invalid";

/**
 * Only same-app relative paths are honoured, so sign-in can never be used to bounce
 * a user to another site. Resolving against a placeholder origin catches the
 * protocol-relative and backslash forms browsers treat as off-site.
 */
export function sanitizeReturnTo(returnTo: string | undefined): string {
  if (!returnTo?.startsWith("/")) {
    return APP_ROOT;
  }
  const resolved = URL.parse(returnTo, PLACEHOLDER_ORIGIN);
  if (resolved?.origin !== PLACEHOLDER_ORIGIN) {
    return APP_ROOT;
  }
  return resolved.pathname + resolved.search + resolved.hash;
}
