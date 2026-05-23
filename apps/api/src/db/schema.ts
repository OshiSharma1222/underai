import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const documentRoleEnum = pgEnum("document_role", [
  "reference",
  "comparison",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "extracting",
  "extracted",
  "failed",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "partial",
  "failed",
]);

export const comparisonItemStatusEnum = pgEnum("comparison_item_status", [
  "pending",
  "extracting",
  "comparing",
  "completed",
  "failed",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const comparisonSessions = pgTable("comparison_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const referenceVersions = pgTable("reference_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => comparisonSessions.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileHash: varchar("file_hash", { length: 64 }).notNull(),
  storagePath: text("storage_path").notNull(),
  extractedData: jsonb("extracted_data"),
  normalizedData: jsonb("normalized_data"),
  isCurrent: boolean("is_current").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => comparisonSessions.id, { onDelete: "cascade" }),
    referenceVersionId: uuid("reference_version_id").references(
      () => referenceVersions.id,
      { onDelete: "set null" }
    ),
    role: documentRoleEnum("role").notNull(),
    fileName: varchar("file_name", { length: 500 }).notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    storagePath: text("storage_path").notNull(),
    extractedData: jsonb("extracted_data"),
    normalizedData: jsonb("normalized_data"),
    status: documentStatusEnum("status").notNull().default("uploaded"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("documents_session_hash_role_idx").on(
      table.sessionId,
      table.fileHash,
      table.role
    ),
  ]
);

export const comparisonJobs = pgTable(
  "comparison_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => comparisonSessions.id, { onDelete: "cascade" }),
    referenceVersionId: uuid("reference_version_id")
      .notNull()
      .references(() => referenceVersions.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    progress: jsonb("progress").$type<{
      total: number;
      completed: number;
      failed: number;
    }>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("comparison_jobs_idempotency_key_idx").on(
      table.idempotencyKey
    ),
  ]
);

export const comparisonItems = pgTable("comparison_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => comparisonJobs.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  status: comparisonItemStatusEnum("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  mismatches: jsonb("mismatches"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const jobEvents = pgTable("job_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => comparisonJobs.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => comparisonItems.id, {
    onDelete: "set null",
  }),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
