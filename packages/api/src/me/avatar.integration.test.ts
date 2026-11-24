import {
  ErrorEnvelope,
  Leaderboard,
  Me,
  MemberProfile,
  Members,
  Tournament,
  UploadGrant,
} from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { media, users } from "../db/schema.ts";
import { displayKeyFor } from "../media/media-keys.ts";
import { InMemoryMediaStorage } from "../testing/in-memory-media-storage.ts";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { TestClock } from "../testing/test-clock.ts";
import { useTestDatabase } from "../testing/test-database.ts";

const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/ann-google";
const JPEG = "image/jpeg";

const database = useTestDatabase();
let clock: TestClock;
let storage: InMemoryMediaStorage;
let app: ReturnType<typeof createTestApp>;

type SignedIn = Awaited<ReturnType<typeof signInTestUser>>;
let ann: SignedIn;
let bob: SignedIn;

function send(method: string, path: string, as: SignedIn, body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      ...as.headers,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(async () => {
  clock = new TestClock();
  storage = new InMemoryMediaStorage(clock);
  app = createTestApp(database, { storage });
  ann = await signInTestUser(database, "ann");
  bob = await signInTestUser(database, "bob");
  await database
    .update(users)
    .set({ googleAvatarUrl: GOOGLE_AVATAR })
    .where(eq(users.id, ann.user.id));
});

async function uploadedAvatar(as = ann) {
  const response = await send("POST", "/api/me/avatar/uploads", as, {
    contentType: JPEG,
  });
  const grant = UploadGrant.parse(await response.json());
  storage.upload(grant, { contentType: JPEG, size: 500_000 });
  return grant;
}

function confirm(mediaId: string, as = ann) {
  return send("POST", "/api/me/avatar", as, { mediaId });
}

/** Does what the processor Lambda does once it has made the display variant. */
async function finishProcessing(mediaId: string) {
  const [row] = await database
    .select()
    .from(media)
    .where(eq(media.id, mediaId));
  const displayKey = displayKeyFor(mediaId);
  storage.put(displayKey, { contentType: "image/webp", size: 40_000 });
  await storage.remove([row?.uploadKey ?? ""]);
  await database
    .update(media)
    .set({ status: "ready", displayKey })
    .where(eq(media.id, mediaId));
}

async function annsAvatarEverywhere() {
  const me = Me.parse(await (await send("GET", "/api/me", ann)).json());
  const members = Members.parse(
    await (await send("GET", "/api/members", bob)).json(),
  );
  const profile = MemberProfile.parse(
    await (await send("GET", `/api/members/${ann.user.id}`, bob)).json(),
  );
  const leaderboard = Leaderboard.parse(
    await (await app.request("/api/leaderboard")).json(),
  );
  return {
    me: me.avatarUrl,
    members: members.find((member) => member.id === ann.user.id)?.avatarUrl,
    profile: profile.avatarUrl,
    leaderboard: leaderboard.find((entry) => entry.userId === ann.user.id)
      ?.avatarUrl,
  };
}

async function errorCode(response: Response) {
  return ErrorEnvelope.parse(await response.json()).error.code;
}

describe("avatar upload grant", () => {
  test("is issued for the caller's own avatar and expires within 15 minutes", async () => {
    const response = await send("POST", "/api/me/avatar/uploads", ann, {
      contentType: JPEG,
    });
    const grant = UploadGrant.parse(await response.json());

    expect(response.status).toBe(201);
    expect(grant.expiresAt).toBe(clock.now().getTime() + 15 * 60 * 1000);
    const [row] = await database.select().from(media);
    expect(row).toMatchObject({
      kind: "avatar",
      ownerUserId: ann.user.id,
      status: "pending",
    });
  });

  test("refuses a type that is not an allowed image", async () => {
    const response = await send("POST", "/api/me/avatar/uploads", ann, {
      contentType: "image/gif",
    });

    expect(response.status).toBe(400);
  });
});

describe("confirming an avatar", () => {
  test("shows the Google avatar while the upload is processed", async () => {
    const grant = await uploadedAvatar();

    const response = await confirm(grant.mediaId);

    expect(response.status).toBe(200);
    expect(Me.parse(await response.json()).avatarUrl).toBe(GOOGLE_AVATAR);
  });

  test("shows the uploaded avatar everywhere once processed, even to anonymous readers", async () => {
    const grant = await uploadedAvatar();
    await confirm(grant.mediaId);
    await finishProcessing(grant.mediaId);

    const avatars = await annsAvatarEverywhere();

    const signedAvatar = expect.stringContaining(
      `display/${grant.mediaId}.webp?expires=`,
    );
    expect(avatars).toEqual({
      me: signedAvatar,
      members: signedAvatar,
      profile: signedAvatar,
      leaderboard: signedAvatar,
    });
  });

  test("an upload that never reached storage is refused", async () => {
    const response = await send("POST", "/api/me/avatar/uploads", ann, {
      contentType: JPEG,
    });
    const grant = UploadGrant.parse(await response.json());

    const confirmed = await confirm(grant.mediaId);

    expect(await errorCode(confirmed)).toBe("upload_missing");
  });

  test("someone else's upload cannot become your avatar", async () => {
    const bobsUpload = await uploadedAvatar(bob);

    const response = await confirm(bobsUpload.mediaId, ann);

    expect(await errorCode(response)).toBe("unknown_media");
  });

  test("a tournament photo upload cannot become an avatar", async () => {
    const recorded = await send("POST", "/api/tournaments", ann, {
      playedOn: Date.now() - 60_000,
      participantIds: [ann.user.id, bob.user.id],
      winnerId: ann.user.id,
      winningHand: "pair",
      pot: 10,
    });
    const { id: tournamentId } = Tournament.parse(await recorded.json());
    const photoGrant = UploadGrant.parse(
      await (
        await send(
          "POST",
          `/api/tournaments/${tournamentId}/photo/uploads`,
          ann,
          {
            contentType: JPEG,
          },
        )
      ).json(),
    );
    storage.upload(photoGrant, { contentType: JPEG, size: 500_000 });

    const response = await confirm(photoGrant.mediaId);

    expect(await errorCode(response)).toBe("unknown_media");
  });

  test("a new avatar replaces the old one and its images are deleted", async () => {
    const first = await uploadedAvatar();
    await confirm(first.mediaId);
    await finishProcessing(first.mediaId);
    const second = await uploadedAvatar();

    await confirm(second.mediaId);

    expect(await storage.exists(displayKeyFor(first.mediaId))).toBe(false);
    expect((await database.select().from(media)).map((row) => row.id)).toEqual([
      second.mediaId,
    ]);
  });
});

describe("DELETE /api/me/avatar", () => {
  test("reverts to the Google avatar and deletes the uploaded images", async () => {
    const grant = await uploadedAvatar();
    await confirm(grant.mediaId);
    await finishProcessing(grant.mediaId);

    const response = await send("DELETE", "/api/me/avatar", ann);

    expect(response.status).toBe(204);
    expect(await annsAvatarEverywhere()).toEqual({
      me: GOOGLE_AVATAR,
      members: GOOGLE_AVATAR,
      profile: GOOGLE_AVATAR,
      leaderboard: GOOGLE_AVATAR,
    });
    expect(storage.objects.size).toBe(0);
    expect(await database.select().from(media)).toHaveLength(0);
  });

  test("leaves another member's avatar alone", async () => {
    const bobs = await uploadedAvatar(bob);
    await confirm(bobs.mediaId, bob);
    await finishProcessing(bobs.mediaId);

    await send("DELETE", "/api/me/avatar", ann);

    expect(await storage.exists(displayKeyFor(bobs.mediaId))).toBe(true);
  });
});
