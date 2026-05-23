import fs from "fs/promises";
import path from "path";
import { extractInsuranceFromDocument } from "./gemini";
import type { NormalizedInsurance } from "@underai/shared";

export async function ensurePdfFileExists(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  try {
    await fs.access(resolved);
    return resolved;
  } catch {
    throw new Error(
      `PDF file not found on server (${resolved}). Please upload the document again.`
    );
  }
}

export async function extractNormalizedInsurance(
  filePath: string,
  documentType: "placement_slip" | "policy"
): Promise<{ normalized: NormalizedInsurance; meta: Record<string, unknown> }> {
  const resolved = await ensurePdfFileExists(filePath);
  const { normalized, method } = await extractInsuranceFromDocument(
    resolved,
    documentType
  );
  return {
    normalized,
    meta: { extractionMethod: method },
  };
}
