import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  comparisonItems,
  comparisonJobs,
  documents,
  jobEvents,
} from "../db/schema";

export const jobRepo = {
  async findByIdempotencyKey(key: string) {
    return db.query.comparisonJobs.findFirst({
      where: eq(comparisonJobs.idempotencyKey, key),
    });
  },

  async createJob(data: {
    sessionId: string;
    referenceVersionId: string;
    idempotencyKey: string;
    documentIds: string[];
  }) {
    const [job] = await db
      .insert(comparisonJobs)
      .values({
        sessionId: data.sessionId,
        referenceVersionId: data.referenceVersionId,
        idempotencyKey: data.idempotencyKey,
        status: "pending",
        progress: { total: data.documentIds.length, completed: 0, failed: 0 },
      })
      .returning();

    const items = await db
      .insert(comparisonItems)
      .values(
        data.documentIds.map((documentId) => ({
          jobId: job.id,
          documentId,
          status: "pending" as const,
        }))
      )
      .returning();

    return { job, items };
  },

  async findJobWithDetails(jobId: string) {
    const job = await db.query.comparisonJobs.findFirst({
      where: eq(comparisonJobs.id, jobId),
    });
    if (!job) return null;

    const items = await db.query.comparisonItems.findMany({
      where: eq(comparisonItems.jobId, jobId),
    });

    const docIds = items.map((i) => i.documentId);
    const docs =
      docIds.length > 0
        ? await db.query.documents.findMany({
            where: inArray(documents.id, docIds),
          })
        : [];

    const events = await db.query.jobEvents.findMany({
      where: eq(jobEvents.jobId, jobId),
      orderBy: [desc(jobEvents.createdAt)],
      limit: 50,
    });

    return { job, items, documents: docs, events };
  },

  async updateJob(
    jobId: string,
    data: Partial<{
      status: "pending" | "running" | "completed" | "partial" | "failed";
      progress: { total: number; completed: number; failed: number };
      startedAt: Date;
      completedAt: Date;
    }>
  ) {
    const [updated] = await db
      .update(comparisonJobs)
      .set(data)
      .where(eq(comparisonJobs.id, jobId))
      .returning();
    return updated;
  },

  async updateItem(
    itemId: string,
    data: Partial<{
      status: "pending" | "extracting" | "comparing" | "completed" | "failed";
      attemptCount: number;
      mismatches: unknown;
      errorMessage: string | null;
      startedAt: Date;
      completedAt: Date;
    }>
  ) {
    const [updated] = await db
      .update(comparisonItems)
      .set(data)
      .where(eq(comparisonItems.id, itemId))
      .returning();
    return updated;
  },

  async getItemsForJob(jobId: string) {
    return db.query.comparisonItems.findMany({
      where: eq(comparisonItems.jobId, jobId),
    });
  },

  async insertEvent(data: {
    jobId: string;
    itemId?: string;
    eventType: string;
    payload?: Record<string, unknown>;
  }) {
    const [event] = await db.insert(jobEvents).values(data).returning();
    return event;
  },
};
