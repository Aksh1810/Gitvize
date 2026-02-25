// ============================================================================
// GitViz — Database Connection
// ============================================================================

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// For environments without a database (development/preview),
// we export a nullable client. All DB calls should check for this.
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

if (connectionString) {
    const client = postgres(connectionString);
    db = drizzle(client, { schema });
}

export { db };
export type Database = NonNullable<typeof db>;
