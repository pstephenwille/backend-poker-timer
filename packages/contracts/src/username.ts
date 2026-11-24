import { z } from "zod";

export const USERNAME_MIN_LENGTH = 6;
export const USERNAME_MAX_LENGTH = 30;
/** Gmail's rules: letters, digits and single periods between them; periods are significant. */
export const USERNAME_PATTERN = "^[A-Za-z0-9]+(\\.[A-Za-z0-9]+)*$";

const USERNAME_RULES = `Usernames are ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} letters, digits or periods, with no leading, trailing or consecutive periods`;

export const Username = z
  .string()
  .min(USERNAME_MIN_LENGTH, USERNAME_RULES)
  .max(USERNAME_MAX_LENGTH, USERNAME_RULES)
  .regex(new RegExp(USERNAME_PATTERN), USERNAME_RULES);
export type Username = z.infer<typeof Username>;

export const UpdateMe = z.strictObject({
  username: Username.nullable(),
});
export type UpdateMe = z.infer<typeof UpdateMe>;
