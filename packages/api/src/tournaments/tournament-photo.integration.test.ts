import {
  ErrorEnvelope,
  Tournament,
  TournamentPage,
  UploadGrant,
} from "@pstephenwille/poker-timer-contracts";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { media } from "../db/schema.ts";
import { displayKeyFor } from "../media/media-keys.ts";
import { InMemoryMediaStorage } from "../testing/in-memory-media-storage.ts";
import { createTestApp, signInTestUser } from "../testing/test-app.ts";
import { TestClock } from "../testing/test-clock.ts";
import { useTestDatabase } from "../testing/test-database.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const JPEG = "image/jpeg";
const PHOTO_BYTES = 2_000_000;

const database = useTestDatabase();
let clock: TestClock;
let storage: InMemoryMediaStorage;
let app: ReturnType<typeof createTestApp>;

type SignedIn = Awaited<ReturnType<typeof signInTestUser>>;
let recorder: SignedIn;
let participant: SignedIn;
let admin: SignedIn;
let tournamentId: string;

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
  recorder = await signInTestUser(database, "ann");
  participant = await signInTestUser(database, "bob");
  admin = await signInTestUser(database, "cal", { isAdmin: true });
  const created = await send("POST", "/api/tournaments", recorder, {
    playedOn: Date.now() - DAY_MS,
    participantIds: [recorder.user.id, participant.user.id],
    winnerId: recorder.user.id,
    winningHand: "flush",
    pot: 120,
  });
  tournamentId = Tournament.parse(await created.json()).id;
});

function requestGrant(as = recorder, contentType: string = JPEG) {
  return send("POST", `/api/tournaments/${tournamentId}/photo/uploads`, as, {
    contentType,
  });
}

async function grantFor(as = recorder) {
  return UploadGrant.parse(await (await requestGrant(as)).json());
}

function confirm(mediaId: string, as = recorder) {
  return send("POST", `/api/tournaments/${tournamentId}/photo`, as, {
    mediaId,
  });
}

async function uploadedPhoto(as = recorder) {
  const grant = await grantFor(as);
  storage.upload(grant, { contentType: JPEG, size: PHOTO_BYTES });
  return grant;
}

/** Does what the processor Lambda does once it has made the display variant. */
async function finishProcessing(mediaId: string) {
  const [row] = await database
    .select()
    .from(media)
    .where(eq(media.id, mediaId));
  const displayKey = displayKeyFor(mediaId);
  storage.put(displayKey, { contentType: "image/webp", size: 300_000 });
  await storage.remove([row?.uploadKey ?? ""]);
  await database
    .update(media)
    .set({ status: "ready", displayKey })
    .where(eq(media.id, mediaId));
}

async function readTournament() {
  const response = await send(
    "GET",
    `/api/tournaments/${tournamentId}`,
    participant,
  );
  return Tournament.parse(await response.json());
}

async function errorCode(response: Response) {
  return ErrorEnvelope.parse(await response.json()).error.code;
}

describe("photo upload grant", () => {
  test("the recorder gets a grant that expires within 15 minutes", async () => {
    const response = await requestGrant();
    const grant = UploadGrant.parse(await response.json());

    expect(response.status).toBe(201);
    expect(grant.expiresAt).toBe(clock.now().getTime() + 15 * MINUTE_MS);
    expect(grant.fields).toMatchObject({
      key: `uploads/${grant.mediaId}`,
      "Content-Type": JPEG,
    });
    const [row] = await database.select().from(media);
    expect(row).toMatchObject({
      id: grant.mediaId,
      kind: "tournament_photo",
      status: "pending",
      ownerUserId: recorder.user.id,
    });
  });

  test("an admin may request one", async () => {
    expect((await requestGrant(admin)).status).toBe(201);
  });

  test("a participant who did not record the tournament is refused", async () => {
    const response = await requestGrant(participant);

    expect(response.status).toBe(403);
    expect(await database.select().from(media)).toHaveLength(0);
  });

  test("a PDF is not an allowed type", async () => {
    const response = await requestGrant(recorder, "application/pdf");

    expect(response.status).toBe(400);
  });

  test("storage refuses a 12 MB file, and nothing can be attached", async () => {
    const grant = await grantFor();

    expect(() =>
      storage.upload(grant, { contentType: JPEG, size: 12 * 1024 * 1024 }),
    ).toThrow();
    const response = await confirm(grant.mediaId);
    expect(await errorCode(response)).toBe("upload_missing");
    expect((await readTournament()).photo).toBeNull();
  });

  test("storage refuses a file of a different type than the grant", async () => {
    const grant = await grantFor();

    expect(() =>
      storage.upload(grant, { contentType: "application/pdf", size: 1000 }),
    ).toThrow();
  });
});

describe("confirming a photo", () => {
  test("an upload that never reached storage is refused and nothing changes", async () => {
    const grant = await grantFor();

    const response = await confirm(grant.mediaId);

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("upload_missing");
    expect((await readTournament()).photo).toBeNull();
  });

  test("a confirmed photo shows as processing with no image URL", async () => {
    const grant = await uploadedPhoto();

    const response = await confirm(grant.mediaId);

    expect(response.status).toBe(200);
    expect(Tournament.parse(await response.json()).photo).toEqual({
      status: "processing",
    });
  });

  test("a processed photo is served through a URL that expires within an hour", async () => {
    const grant = await uploadedPhoto();
    await confirm(grant.mediaId);
    await finishProcessing(grant.mediaId);

    const { photo } = await readTournament();

    expect(photo?.status).toBe("ready");
    const url = new URL(photo?.status === "ready" ? photo.url : "");
    expect(url.pathname).toContain(`display/${grant.mediaId}.webp`);
    expect(Number(url.searchParams.get("expires"))).toBeLessThanOrEqual(
      clock.now().getTime() + 60 * MINUTE_MS,
    );
  });

  test("can be confirmed after processing has already finished", async () => {
    const grant = await uploadedPhoto();
    await finishProcessing(grant.mediaId);

    const response = await confirm(grant.mediaId);

    expect(response.status).toBe(200);
    expect(Tournament.parse(await response.json()).photo?.status).toBe("ready");
  });

  test("the list shows photos too", async () => {
    const grant = await uploadedPhoto();
    await confirm(grant.mediaId);

    const response = await send("GET", "/api/tournaments", participant);
    const page = TournamentPage.parse(await response.json());

    expect(page.items[0]?.photo).toEqual({ status: "processing" });
  });

  test("a new photo replaces the old one and the old images are deleted", async () => {
    const first = await uploadedPhoto();
    await confirm(first.mediaId);
    await finishProcessing(first.mediaId);
    const second = await uploadedPhoto();

    await confirm(second.mediaId);

    expect(await storage.exists(displayKeyFor(first.mediaId))).toBe(false);
    expect((await database.select().from(media)).map((row) => row.id)).toEqual([
      second.mediaId,
    ]);
  });

  test("an upload granted to someone else cannot be attached", async () => {
    const adminsGrant = await uploadedPhoto(admin);

    const response = await confirm(adminsGrant.mediaId, recorder);

    expect(await errorCode(response)).toBe("unknown_media");
  });

  test("a participant who did not record the tournament cannot confirm", async () => {
    const grant = await uploadedPhoto();

    expect((await confirm(grant.mediaId, participant)).status).toBe(403);
  });
});

describe("removing a photo", () => {
  test("the recorder removes it and the stored images are deleted", async () => {
    const grant = await uploadedPhoto();
    await confirm(grant.mediaId);
    await finishProcessing(grant.mediaId);

    const response = await send(
      "DELETE",
      `/api/tournaments/${tournamentId}/photo`,
      recorder,
    );

    expect(response.status).toBe(204);
    expect((await readTournament()).photo).toBeNull();
    expect(storage.objects.size).toBe(0);
    expect(await database.select().from(media)).toHaveLength(0);
  });

  test("a participant who did not record the tournament is refused", async () => {
    const response = await send(
      "DELETE",
      `/api/tournaments/${tournamentId}/photo`,
      participant,
    );

    expect(response.status).toBe(403);
  });

  test("deleting the tournament deletes its photo", async () => {
    const grant = await uploadedPhoto();
    await confirm(grant.mediaId);
    await finishProcessing(grant.mediaId);

    await send("DELETE", `/api/tournaments/${tournamentId}`, admin);

    expect(storage.objects.size).toBe(0);
    expect(await database.select().from(media)).toHaveLength(0);
  });
});
