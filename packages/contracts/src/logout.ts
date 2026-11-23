import { z } from "zod";

export const Logout = z.strictObject({
  signOutUrl: z.url(),
});
export type Logout = z.infer<typeof Logout>;
