import { MAX_UPLOAD_BYTES } from "@pstephenwille/poker-timer-contracts";
import { beforeEach, describe, expect, test } from "vitest";
import { InMemoryMediaStorage } from "./in-memory-media-storage.ts";
import { TestClock } from "./test-clock.ts";

const MINUTE_MS = 60 * 1000;
const KEY = "uploads/3c8e1f4a-5b6d-4a7e-9f0c-2b4d6e8f0a1c";

let clock: TestClock;
let storage: InMemoryMediaStorage;

beforeEach(() => {
  clock = new TestClock();
  storage = new InMemoryMediaStorage(clock);
});

function grantForJpeg() {
  return storage.presignUpload({ key: KEY, contentType: "image/jpeg" });
}

describe("InMemoryMediaStorage", () => {
  test("a grant names the key and type and expires in 15 minutes", async () => {
    const grant = await grantForJpeg();

    expect(grant.fields).toEqual({ key: KEY, "Content-Type": "image/jpeg" });
    expect(grant.expiresAt).toBe(clock.now().getTime() + 15 * MINUTE_MS);
  });

  test("a matching upload is stored", async () => {
    storage.upload(await grantForJpeg(), {
      contentType: "image/jpeg",
      size: 2_000_000,
    });

    expect(await storage.exists(KEY)).toBe(true);
  });

  test("an upload over 10 MB is refused", async () => {
    const grant = await grantForJpeg();

    expect(() =>
      storage.upload(grant, {
        contentType: "image/jpeg",
        size: MAX_UPLOAD_BYTES + 1,
      }),
    ).toThrow(/out of range/);
    expect(await storage.exists(KEY)).toBe(false);
  });

  test("an upload of a different type is refused", async () => {
    const grant = await grantForJpeg();

    expect(() =>
      storage.upload(grant, { contentType: "application/pdf", size: 1000 }),
    ).toThrow(/does not match/);
  });

  test("an upload after the grant expires is refused", async () => {
    const grant = await grantForJpeg();
    clock.advance(15 * MINUTE_MS + 1);

    expect(() =>
      storage.upload(grant, { contentType: "image/jpeg", size: 1000 }),
    ).toThrow(/expired/);
  });

  test("download URLs expire within an hour", async () => {
    const url = new URL(await storage.presignDownload(KEY));

    expect(Number(url.searchParams.get("expires"))).toBe(
      clock.now().getTime() + 60 * MINUTE_MS,
    );
  });

  test("removed objects no longer exist", async () => {
    storage.put(KEY, { contentType: "image/webp", size: 10 });

    await storage.remove([KEY]);

    expect(await storage.exists(KEY)).toBe(false);
  });
});
