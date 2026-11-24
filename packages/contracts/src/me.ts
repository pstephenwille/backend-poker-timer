import { z } from "zod";

export const Me = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  isAdmin: z.boolean(),
  username: z.string().nullable(),
  displayName: z.string(),
  avatarUrl: z.url().nullable(),
});
export type Me = z.infer<typeof Me>;
