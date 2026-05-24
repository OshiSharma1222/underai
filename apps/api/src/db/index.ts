import "../load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../lib/config";
import * as schema from "./schema";
import * as relations from "./relations";

const connectionString = config.databaseUrl;

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
