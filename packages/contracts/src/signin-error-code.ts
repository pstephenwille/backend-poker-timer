import { z } from "zod";

export const SigninErrorCode = z.enum([
  "cancelled",
  "expired",
  "deactivated",
  "failed",
]);
export type SigninErrorCode = z.infer<typeof SigninErrorCode>;
