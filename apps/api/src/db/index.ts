import "../load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import * as relations from "./relations";

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl:
    connectionString?.includes("neon.tech") ||
    connectionString?.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
});

export const db = drizzle(pool, { schema: { ...schema, ...relations } });
export type Db = typeof db;
