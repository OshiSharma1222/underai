/**
 * Run once if you pasted schema SQL into Neon manually and `db:migrate` fails
 * with "type already exists". Marks migration 0000 as applied without re-running SQL.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import "../src/load-env";

const migrationsFolder = path.resolve(__dirname, "../drizzle");
const journal = JSON.parse(
  fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8")
) as { entries: Array<{ tag: string; when: number }> };

async function main() {
  const entry = journal.entries[0];
  const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
  const query = fs.readFileSync(sqlPath, "utf8");
  const hash = crypto.createHash("sha256").update(query).digest("hex");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);

  const existing = await pool.query(
    `SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = $1`,
    [hash]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    console.log("Migration already marked as applied.");
  } else {
    await pool.query(
      `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, entry.when]
    );
    console.log(`Marked ${entry.tag} as applied (hash: ${hash.slice(0, 12)}…)`);
  }

  await pool.end();
  console.log("Done. Run: npm run db:migrate");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
