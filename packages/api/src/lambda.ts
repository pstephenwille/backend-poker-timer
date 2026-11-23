import { handle } from "hono/aws-lambda";
import { Resource } from "sst";
import { createApp } from "./app.ts";
import { createDatabase } from "./db/database.ts";

/** Created at module load so each Lambda container reuses one connection pool across requests. */
const database = createDatabase(Resource.DatabaseUrl.value);

export const handler = handle(createApp({ database }));
