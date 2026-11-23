import { z } from "zod";

export const Me = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  isAdmin: z.boolean(),
});
export type Me = z.infer<typeof Me>;
