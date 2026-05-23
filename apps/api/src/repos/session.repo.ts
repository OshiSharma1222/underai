import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  comparisonSessions,
  documents,
  referenceVersions,
} from "../db/schema";

export const sessionRepo = {
  async create(userId: string, name?: string) {
    const [session] = await db
      .insert(comparisonSessions)
      .values({ userId, name })
      .returning();
    return session;
  },

  async findByIdForUser(sessionId: string, userId: string) {
    return db.query.comparisonSessions.findFirst({
      where: and(
        eq(comparisonSessions.id, sessionId),
        eq(comparisonSessions.userId, userId)
      ),
    });
  },

  async getCurrentReferenceVersion(sessionId: string) {
    return db.query.referenceVersions.findFirst({
      where: and(
        eq(referenceVersions.sessionId, sessionId),
        eq(referenceVersions.isCurrent, true)
      ),
      orderBy: [desc(referenceVersions.version)],
    });
  },

  async getNextReferenceVersionNumber(sessionId: string) {
    const latest = await db.query.referenceVersions.findFirst({
      where: eq(referenceVersions.sessionId, sessionId),
      orderBy: [desc(referenceVersions.version)],
    });
    return (latest?.version ?? 0) + 1;
  },

  async createReferenceVersion(data: {
    sessionId: string;
    version: number;
    fileName: string;
    fileHash: string;
    storagePath: string;
  }) {
    await db
      .update(referenceVersions)
      .set({ isCurrent: false })
      .where(eq(referenceVersions.sessionId, data.sessionId));

    const [version] = await db
      .insert(referenceVersions)
      .values({ ...data, isCurrent: true })
      .returning();
    return version;
  },

  async updateReferenceExtraction(
    id: string,
    extractedData: unknown,
    normalizedData: unknown
  ) {
    const [updated] = await db
      .update(referenceVersions)
      .set({ extractedData, normalizedData })
      .where(eq(referenceVersions.id, id))
      .returning();
    return updated;
  },

  async findDocumentBySessionHash(
    sessionId: string,
    fileHash: string,
    role: "reference" | "comparison"
  ) {
    return db.query.documents.findFirst({
      where: and(
        eq(documents.sessionId, sessionId),
        eq(documents.fileHash, fileHash),
        eq(documents.role, role)
      ),
    });
  },

  async upsertComparisonDocument(data: {
    sessionId: string;
    referenceVersionId: string;
    fileName: string;
    fileHash: string;
    storagePath: string;
  }) {
    const existing = await this.findDocumentBySessionHash(
      data.sessionId,
      data.fileHash,
      "comparison"
    );
    if (existing) {
      return existing;
    }

    const [doc] = await db
      .insert(documents)
      .values({
        sessionId: data.sessionId,
        referenceVersionId: data.referenceVersionId,
        role: "comparison",
        fileName: data.fileName,
        fileHash: data.fileHash,
        storagePath: data.storagePath,
        status: "uploaded",
      })
      .returning();
    return doc;
  },

  async listComparisonDocuments(sessionId: string) {
    return db.query.documents.findMany({
      where: and(
        eq(documents.sessionId, sessionId),
        eq(documents.role, "comparison")
      ),
      orderBy: [desc(documents.createdAt)],
    });
  },

  async getDocumentById(documentId: string) {
    return db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });
  },

  async updateDocument(
    documentId: string,
    data: Partial<{
      status: "uploaded" | "extracting" | "extracted" | "failed";
      extractedData: unknown;
      normalizedData: unknown;
      errorMessage: string | null;
    }>
  ) {
    const [updated] = await db
      .update(documents)
      .set(data)
      .where(eq(documents.id, documentId))
      .returning();
    return updated;
  },
};
