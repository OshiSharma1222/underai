import type { NormalizedInsurance } from "@underai/shared";
import { compareInsuranceDocuments, isTransientError } from "../lib/gemini";
import { hashString } from "../lib/hash";
import { NotFoundError, ValidationError } from "../lib/errors";
import { publishJobEvent } from "../lib/sse-hub";
import { jobRepo } from "../repos/job.repo";
import { sessionRepo } from "../repos/session.repo";
import { sessionService } from "./session.service";

const MAX_RETRIES = 3;

export const comparisonService = {
  async startComparison(
    userId: string,
    sessionId: string,
    documentIds: string[],
    idempotencyKeyHeader?: string
  ) {
    const session = await sessionRepo.findByIdForUser(sessionId, userId);
    if (!session) throw new NotFoundError("Session not found");

    const reference = await sessionRepo.getCurrentReferenceVersion(sessionId);
    if (!reference?.normalizedData) {
      throw new ValidationError(
        "Placement slip must be uploaded and extracted before comparison"
      );
    }

    const sortedIds = [...documentIds].sort();
    const idempotencyKey =
      idempotencyKeyHeader ??
      hashString(`${reference.id}:${sortedIds.join(",")}`);

    const existing = await jobRepo.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      const items = await jobRepo.getItemsForJob(existing.id);
      return { job: existing, items, reused: true };
    }

    for (const docId of documentIds) {
      const doc = await sessionRepo.getDocumentById(docId);
      if (!doc || doc.sessionId !== sessionId || doc.role !== "comparison") {
        throw new ValidationError(`Invalid document: ${docId}`);
      }
    }

    const { job, items } = await jobRepo.createJob({
      sessionId,
      referenceVersionId: reference.id,
      idempotencyKey,
      documentIds: sortedIds,
    });

    await jobRepo.insertEvent({
      jobId: job.id,
      eventType: "job.created",
      payload: { total: items.length },
    });

    void this.runJobInBackground(
      job.id,
      reference.normalizedData as NormalizedInsurance
    );

    return { job, items, reused: false };
  },

  async getJob(jobId: string, userId: string) {
    const details = await jobRepo.findJobWithDetails(jobId);
    if (!details) throw new NotFoundError("Job not found");

    const session = await sessionRepo.findByIdForUser(
      details.job.sessionId,
      userId
    );
    if (!session) throw new NotFoundError("Job not found");

    return details;
  },

  async runJobInBackground(
    jobId: string,
    referenceData: NormalizedInsurance
  ) {
    await jobRepo.updateJob(jobId, {
      status: "running",
      startedAt: new Date(),
    });

    publishJobEvent(jobId, "job.started", { jobId });
    await jobRepo.insertEvent({
      jobId,
      eventType: "job.started",
      payload: {},
    });

    const items = await jobRepo.getItemsForJob(jobId);
    let completed = 0;
    let failed = 0;

    for (const item of items) {
      try {
        await this.processItem(jobId, item.id, item.documentId, referenceData);
        completed += 1;
      } catch {
        failed += 1;
      }

      const progress = {
        total: items.length,
        completed,
        failed,
      };
      await jobRepo.updateJob(jobId, { progress });

      publishJobEvent(jobId, "job.progress", { jobId, progress });
    }

    const finalStatus =
      failed === 0
        ? "completed"
        : failed === items.length
          ? "failed"
          : "partial";

    await jobRepo.updateJob(jobId, {
      status: finalStatus,
      completedAt: new Date(),
      progress: { total: items.length, completed, failed },
    });

    publishJobEvent(jobId, "job.completed", {
      jobId,
      status: finalStatus,
      progress: { total: items.length, completed, failed },
    });

    await jobRepo.insertEvent({
      jobId,
      eventType: "job.completed",
      payload: { status: finalStatus },
    });
  },

  async processItem(
    jobId: string,
    itemId: string,
    documentId: string,
    referenceData: NormalizedInsurance
  ) {
    const doc = await sessionRepo.getDocumentById(documentId);
    if (!doc) throw new NotFoundError("Document not found");

    await jobRepo.updateItem(itemId, {
      status: "extracting",
      startedAt: new Date(),
      attemptCount: 0,
    });

    publishJobEvent(jobId, "item.progress", {
      jobId,
      itemId,
      documentId,
      status: "extracting",
      fileName: doc.fileName,
    });

    let policyData: NormalizedInsurance;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await jobRepo.updateItem(itemId, { attemptCount: attempt });

        if (doc.normalizedData && doc.status === "extracted") {
          policyData = doc.normalizedData as NormalizedInsurance;
        } else {
          policyData = await sessionService.extractDocumentWithRetry(
            documentId,
            doc.storagePath,
            1
          );
        }

        await jobRepo.updateItem(itemId, { status: "comparing" });
        publishJobEvent(jobId, "item.progress", {
          jobId,
          itemId,
          documentId,
          status: "comparing",
          fileName: doc.fileName,
        });

        const result = await compareInsuranceDocuments(
          referenceData,
          policyData
        );

        await jobRepo.updateItem(itemId, {
          status: "completed",
          mismatches: result,
          completedAt: new Date(),
          errorMessage: null,
        });

        publishJobEvent(jobId, "item.completed", {
          jobId,
          itemId,
          documentId,
          fileName: doc.fileName,
          mismatchCount: result.mismatches.length,
          summary: result.summary,
        });

        await jobRepo.insertEvent({
          jobId,
          itemId,
          eventType: "item.completed",
          payload: {
            documentId,
            mismatchCount: result.mismatches.length,
          },
        });

        return;
      } catch (error) {
        lastError = error;
        if (!isTransientError(error) || attempt === MAX_RETRIES) break;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : "Comparison failed";

    await jobRepo.updateItem(itemId, {
      status: "failed",
      errorMessage: message,
      completedAt: new Date(),
    });

    publishJobEvent(jobId, "item.failed", {
      jobId,
      itemId,
      documentId,
      fileName: doc.fileName,
      error: message,
    });

    await jobRepo.insertEvent({
      jobId,
      itemId,
      eventType: "item.failed",
      payload: { documentId, error: message },
    });

    throw lastError;
  },
};
