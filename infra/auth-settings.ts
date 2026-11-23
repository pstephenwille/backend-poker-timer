const MAX_DOMAIN_PREFIX_LENGTH = 63;
const RESERVED_DOMAIN_WORDS = ["aws", "amazon", "cognito"];
const AUTH_CALLBACK_PATH = "/api/auth/callback";
const SIGN_OUT_RETURN_PATH = "/";

/**
 * Cognito domain prefixes are global across all AWS accounts in a region, so the
 * account id is appended to keep each stage's prefix from colliding with anyone else's.
 */
export function cognitoDomainPrefix(
  app: string,
  stage: string,
  accountId: string,
): string {
  const prefix = `${app}-${stage}-${accountId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  if (prefix.length > MAX_DOMAIN_PREFIX_LENGTH) {
    throw new Error(
      `Cognito domain prefix "${prefix}" exceeds ${MAX_DOMAIN_PREFIX_LENGTH} characters; use a shorter stage name`,
    );
  }
  const reservedWord = RESERVED_DOMAIN_WORDS.find((word) =>
    prefix.includes(word),
  );
  if (reservedWord) {
    throw new Error(
      `Cognito domain prefix "${prefix}" contains the reserved word "${reservedWord}"; rename the stage`,
    );
  }
  return prefix;
}

export function authCallbackUrl(appUrl: string): string {
  return new URL(AUTH_CALLBACK_PATH, appUrl).href;
}

export function signOutReturnUrl(appUrl: string): string {
  return new URL(SIGN_OUT_RETURN_PATH, appUrl).href;
}
