import type {
  ErrorDetail,
  ErrorEnvelope,
} from "@pstephenwille/poker-timer-contracts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details: ErrorDetail[] | undefined;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    details?: ErrorDetail[],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toEnvelope(): ErrorEnvelope {
    const error = { code: this.code, message: this.message };
    return this.details
      ? { error: { ...error, details: this.details } }
      : { error };
  }
}
