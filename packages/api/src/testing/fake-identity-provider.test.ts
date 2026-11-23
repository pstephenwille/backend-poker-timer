import { describe, expect, test } from "vitest";
import {
  FakeIdentityProvider,
  FIXED_CLAIMS,
} from "./fake-identity-provider.ts";

async function startedSignin() {
  const provider = new FakeIdentityProvider();
  const start = await provider.startSignin();
  return { provider, ...start };
}

describe("FakeIdentityProvider", () => {
  test("issues the fixed claims for an approved sign-in", async () => {
    const { provider, authorizationUrl, pending } = await startedSignin();

    const callbackParams = provider.approve(authorizationUrl);

    await expect(
      provider.completeSignin(callbackParams, pending),
    ).resolves.toEqual(FIXED_CLAIMS);
  });

  test("reports a cancelled sign-in as access_denied", async () => {
    const { provider, authorizationUrl, pending } = await startedSignin();

    const callbackParams = provider.deny(authorizationUrl);

    await expect(
      provider.completeSignin(callbackParams, pending),
    ).rejects.toMatchObject({ reason: "access_denied" });
  });

  test("rejects a callback whose state does not match", async () => {
    const { provider, authorizationUrl, pending } = await startedSignin();
    const callbackParams = provider.approve(authorizationUrl);

    await expect(
      provider.completeSignin(callbackParams, {
        ...pending,
        state: "other-state",
      }),
    ).rejects.toMatchObject({ reason: "rejected", message: "State mismatch" });
  });

  test("rejects a code that was already used", async () => {
    const { provider, authorizationUrl, pending } = await startedSignin();
    const callbackParams = provider.approve(authorizationUrl);
    await provider.completeSignin(callbackParams, pending);

    await expect(
      provider.completeSignin(callbackParams, pending),
    ).rejects.toMatchObject({ reason: "rejected" });
  });

  test("rejects a nonce from a different sign-in", async () => {
    const { provider, authorizationUrl, pending } = await startedSignin();
    const callbackParams = provider.approve(authorizationUrl);

    await expect(
      provider.completeSignin(callbackParams, { ...pending, nonce: "other" }),
    ).rejects.toMatchObject({ message: "Nonce mismatch" });
  });

  test("rejects a PKCE verifier that does not match the challenge", async () => {
    const { provider, authorizationUrl, pending } = await startedSignin();
    const callbackParams = provider.approve(authorizationUrl);

    await expect(
      provider.completeSignin(callbackParams, {
        ...pending,
        codeVerifier: "other",
      }),
    ).rejects.toMatchObject({ message: "PKCE verifier mismatch" });
  });
});
