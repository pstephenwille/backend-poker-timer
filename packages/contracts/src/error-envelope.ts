import { z } from "zod";

export const ErrorDetail = z.strictObject({
  path: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof ErrorDetail>;

export const ErrorEnvelope = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.array(ErrorDetail).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
