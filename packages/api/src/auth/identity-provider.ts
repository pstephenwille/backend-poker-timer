import { z } from "zod";

export interface PendingSignin {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface SigninStart {
  authorizationUrl: URL;
  pending: PendingSignin;
}

export interface IdentityClaims {
  subject: string;
  email: string;
  name: string | null;
  picture: string | null;
  groups: string[];
}

/** `access_denied` means the user cancelled; every other failure is a rejected response. */
export type IdentityProviderFailure = "access_denied" | "rejected";

export class IdentityProviderError extends Error {
  readonly reason: IdentityProviderFailure;

  constructor(
    reason: IdentityProviderFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.reason = reason;
  }
}

/**
 * The OIDC protocol work behind one seam, so the sign-in routes can be tested
 * with an in-memory provider while production uses a certified client library.
 */
export interface IdentityProvider {
  startSignin(): Promise<SigninStart>;
  /**
   * Takes only the callback's query parameters, because behind CloudFront the
   * request URL the Lambda sees is not the registered callback URL.
   */
  completeSignin(
    callbackParams: URLSearchParams,
    pending: PendingSignin,
  ): Promise<IdentityClaims>;
  signOutUrl(): URL;
}

const IdTokenClaims = z.object({
  sub: z.string().min(1),
  email: z.email(),
  name: z.string().optional(),
  picture: z.url().optional(),
  "cognito:groups": z.array(z.string()).optional(),
});

export function toIdentityClaims(rawClaims: unknown): IdentityClaims {
  const parsed = IdTokenClaims.safeParse(rawClaims);
  if (!parsed.success) {
    throw new IdentityProviderError(
      "rejected",
      `ID token claims are unusable: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`,
    );
  }
  const claims = parsed.data;
  return {
    subject: claims.sub,
    email: claims.email,
    name: claims.name ?? null,
    picture: claims.picture ?? null,
    groups: claims["cognito:groups"] ?? [],
  };
}
