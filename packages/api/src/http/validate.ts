import { zValidator } from "@hono/zod-validator";
import type { ErrorDetail } from "@pstephenwille/poker-timer-contracts";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { ApiError } from "./api-error.ts";

interface ZodIssueLike {
  path: PropertyKey[];
  message: string;
}

function toErrorDetails(issues: ZodIssueLike[]): ErrorDetail[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

export function validate<
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(target: Target, schema: Schema) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new ApiError(
        400,
        "validation_failed",
        "Request validation failed",
        toErrorDetails(result.error.issues),
      );
    }
  });
}
