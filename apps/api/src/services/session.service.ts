import fs from "fs/promises";
import path from "path";
import { NotFoundError, ValidationError } from "../lib/errors";
import { hashFile } from "../lib/hash";
import { extractNormalizedInsurance } from "../lib/document-extract";
import { isTransientError } from "../lib/gemini";
import type { NormalizedInsurance } from "@underai/shared";
import { sessionRepo } from "../repos/session.repo";
import { config } from "../lib/config";

async function ensureUploadDir(sessionId: string) {
  const dir = path.join(config.uploadDir, sessionId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export const sessionService = {
  async createSession(userId: string, name?: string) {
    return sessionRepo.create(userId, name);
  },

  async getSession(userId: string, sessionId: string) {
    const session = await sessionRepo.findByIdForUser(sessionId, userId);
    if (!session) throw new NotFoundError("Session not found");

    const reference = await sessionRepo.getCurrentReferenceVersion(sessionId);
    const documents = await sessionRepo.listComparisonDocuments(sessionId);

    return {
      session,
      reference: reference
        ? {
            ...reference,
            extracted: reference.normalizedData != null,
          }
        : null,
      documents,
    };
  },

  async uploadReference(
    userId: string,
    sessionId: string,
    file: Express.Multer.File
  ) {
    const session = await sessionRepo.findByIdForUser(sessionId, userId);
    if (!session) throw new NotFoundError("Session not found");

    const dir = await ensureUploadDir(sessionId);
    const fileHash = await hashFile(file.path);
    const destPath = path.resolve(
      dir,
      `ref-v${Date.now()}-${file.originalname}`
    );
    await fs.rename(file.path, destPath);

    const versionNumber =
      await sessionRepo.getNextReferenceVersionNumber(sessionId);

    const version = await sessionRepo.createReferenceVersion({
      sessionId,
      version: versionNumber,
      fileName: file.originalname,
      fileHash,
      storagePath: destPath,
    });

    try {
      const { normalized, meta } = await extractNormalizedInsurance(
        destPath,
        "placement_slip"
      );
      await sessionRepo.updateReferenceExtraction(version.id, meta, normalized);

      const updated = await sessionRepo.getCurrentReferenceVersion(sessionId);
      return { version: updated, extracted: true };
    } catch (error) {
      const extractionError =
        error instanceof Error ? error.message : "Extraction failed";
      console.error("[uploadReference] extraction failed:", extractionError);
      throw new ValidationError(
        `Placement slip uploaded but AI extraction failed: ${extractionError}`
      );
    }
  },

  async retryReferenceExtraction(userId: string, sessionId: string) {
    const session = await sessionRepo.findByIdForUser(sessionId, userId);
    if (!session) throw new NotFoundError("Session not found");

    const reference = await sessionRepo.getCurrentReferenceVersion(sessionId);
    if (!reference) {
      throw new ValidationError("No placement slip uploaded yet");
    }

    const { normalized, meta } = await extractNormalizedInsurance(
      reference.storagePath,
      "placement_slip"
    );
    await sessionRepo.updateReferenceExtraction(reference.id, meta, normalized);

    return sessionRepo.getCurrentReferenceVersion(sessionId);
  },

  async uploadPolicies(
    userId: string,
    sessionId: string,
    files: Express.Multer.File[]
  ) {
    const session = await sessionRepo.findByIdForUser(sessionId, userId);
    if (!session) throw new NotFoundError("Session not found");

    const reference = await sessionRepo.getCurrentReferenceVersion(sessionId);
    if (!reference) {
      throw new ValidationError(
        "Upload a placement slip before uploading policies"
      );
    }

    const dir = await ensureUploadDir(sessionId);
    const uploaded = [];

    for (const file of files) {
      const fileHash = await hashFile(file.path);
      const destPath = path.resolve(
        dir,
        `policy-${Date.now()}-${file.originalname}`
      );
      await fs.rename(file.path, destPath);

      const doc = await sessionRepo.upsertComparisonDocument({
        sessionId,
        referenceVersionId: reference.id,
        fileName: file.originalname,
        fileHash,
        storagePath: destPath,
      });
      uploaded.push(doc);
    }

    return { documents: uploaded, referenceVersionId: reference.id };
  },

  async extractDocumentWithRetry(
    documentId: string,
    storagePath: string,
    maxAttempts = 3
  ): Promise<NormalizedInsurance> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await sessionRepo.updateDocument(documentId, {
          status: "extracting",
        });

        const { normalized, meta } = await extractNormalizedInsurance(
          storagePath,
          "policy"
        );
        await sessionRepo.updateDocument(documentId, {
          status: "extracted",
          extractedData: meta,
          normalizedData: normalized,
          errorMessage: null,
        });

        return normalized;
      } catch (error) {
        lastError = error;
        if (!isTransientError(error) || attempt === maxAttempts) {
          await sessionRepo.updateDocument(documentId, {
            status: "failed",
            errorMessage:
              error instanceof Error ? error.message : "Extraction failed",
          });
          throw error;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    throw lastError;
  },
};
