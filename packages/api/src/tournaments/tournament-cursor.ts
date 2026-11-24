import { z } from "zod";

/** The sort key of the last tournament on a page; the next page starts strictly after it. */
const PageCursor = z.strictObject({
  playedOn: z.int().nonnegative(),
  createdAt: z.int().nonnegative(),
  id: z.uuid(),
});
export type PageCursor = z.infer<typeof PageCursor>;

export function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/** Returns null for anything that is not a cursor this API issued. */
export function decodeCursor(encoded: string): PageCursor | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const cursor = PageCursor.safeParse(decoded);
  return cursor.success ? cursor.data : null;
}
