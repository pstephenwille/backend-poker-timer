import { DrizzleQueryError } from "drizzle-orm";

const UNIQUE_VIOLATION = "23505";

interface PostgresError {
  code?: string;
  constraint?: string;
}

function postgresErrorOf(error: unknown): PostgresError | undefined {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return typeof cause === "object" && cause !== null ? cause : undefined;
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const postgresError = postgresErrorOf(error);
  return (
    postgresError?.code === UNIQUE_VIOLATION &&
    postgresError.constraint === constraint
  );
}
