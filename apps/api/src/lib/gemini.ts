import fs from "fs/promises";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  EXTRACTION_JSON_SCHEMA,
  comparisonResultSchema,
  normalizedInsuranceSchema,
  type ComparisonResult,
  type NormalizedInsurance,
} from "@underai/shared";
import { config } from "./config";
import { extractTextFromPdf } from "./pdf";

const defaultModel = "gemini-2.5-flash";

function getModel() {
  if (!config.geminiApiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey"
    );
  }
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const modelName = process.env.GEMINI_MODEL ?? defaultModel;
  return genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" },
  });
}

function parseJsonFromResponse(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonStr);
}

function buildExtractionPrompt(documentType: "placement_slip" | "policy") {
  return `You are an insurance document extraction system. Read the attached PDF and extract structured data.

Return ONLY valid JSON matching this schema (no markdown, no explanation):
${EXTRACTION_JSON_SCHEMA}

Set documentType to "${documentType}".

Rules:
- Dates as YYYY-MM-DD
- Monetary amounts as numbers in INR (no commas, no currency symbols)
- clauses: list each clause/extension name as a separate string
- Normalize whitespace in strings
- If the PDF is image-based, read visible text from the images`;
}

export async function extractInsuranceData(
  documentText: string,
  documentType: "placement_slip" | "policy"
): Promise<NormalizedInsurance> {
  const model = getModel();
  const prompt = `${buildExtractionPrompt(documentType)}

Document text:
---
${documentText.slice(0, 50000)}
---`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = parseJsonFromResponse(raw);
  return normalizedInsuranceSchema.parse(parsed);
}

/** Send PDF bytes to Gemini when pdf-parse finds no text layer (scanned/image PDFs). */
export async function extractInsuranceFromPdfFile(
  filePath: string,
  documentType: "placement_slip" | "policy"
): Promise<NormalizedInsurance> {
  const model = getModel();
  const buffer = await fs.readFile(filePath);
  const prompt = buildExtractionPrompt(documentType);

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: "application/pdf",
        data: buffer.toString("base64"),
      },
    },
    { text: prompt },
  ]);

  const raw = result.response.text();
  const parsed = parseJsonFromResponse(raw);
  return normalizedInsuranceSchema.parse(parsed);
}

const MIN_TEXT_CHARS = 80;

/**
 * Prefer fast text extraction; fall back to Gemini reading the PDF directly.
 */
export async function extractInsuranceFromDocument(
  filePath: string,
  documentType: "placement_slip" | "policy"
): Promise<{ normalized: NormalizedInsurance; method: "text" | "pdf-vision" }> {
  let text = "";
  try {
    text = await extractTextFromPdf(filePath);
  } catch {
    text = "";
  }

  if (text.length >= MIN_TEXT_CHARS) {
    const normalized = await extractInsuranceData(text, documentType);
    return { normalized, method: "text" };
  }

  console.log(
    `[extract] pdf-parse got ${text.length} chars, using Gemini PDF vision for ${filePath}`
  );
  const normalized = await extractInsuranceFromPdfFile(filePath, documentType);
  return { normalized, method: "pdf-vision" };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function valuesAreEquivalent(
  expected: string | number | string[] | null,
  actual: string | number | string[] | null
): boolean {
  if (expected === actual) return true;
  if (expected == null || actual == null) return false;

  if (typeof expected === "number" && typeof actual === "number") {
    return expected === actual;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const a = expected.map((s) => normalizeText(s)).sort();
    const b = actual.map((s) => normalizeText(s)).sort();
    return JSON.stringify(a) === JSON.stringify(b);
  }

  if (typeof expected === "string" && typeof actual === "string") {
    const a = normalizeText(expected);
    const b = normalizeText(actual);
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) {
      const shorter = Math.min(a.length, b.length);
      const longer = Math.max(a.length, b.length);
      return shorter / longer >= 0.85;
    }
  }

  return false;
}

function postProcessComparison(result: ComparisonResult): ComparisonResult {
  const mismatches = result.mismatches.filter((m) => {
    if (valuesAreEquivalent(m.expected, m.actual)) return false;

    const note = (m.note ?? "").toLowerCase();
    const trivialNote =
      note.includes("unchanged") ||
      note.includes("minor difference") ||
      note.includes("formatting") ||
      note.includes("capitalization") ||
      note.includes("semantic equivalent") ||
      note.includes("meaning is unchanged") ||
      note.includes("no material");

    if (m.severity === "info" && trivialNote) return false;

    return true;
  });

  const criticalCount = mismatches.filter((m) => m.severity === "critical").length;
  const warningCount = mismatches.filter((m) => m.severity === "warning").length;
  const matchScore =
    mismatches.length === 0
      ? 100
      : Math.max(0, 100 - criticalCount * 25 - warningCount * 10);

  return {
    ...result,
    mismatches,
    matchScore: result.matchScore ?? matchScore,
    summary:
      mismatches.length === 0
        ? "Policy aligns with the placement slip — no material mismatches."
        : result.summary,
  };
}

export async function compareInsuranceDocuments(
  reference: NormalizedInsurance,
  policy: NormalizedInsurance
): Promise<ComparisonResult> {
  const model = getModel();
  const prompt = `You are an insurance policy audit system. Compare the placement slip (reference) against the issued policy.

Return ONLY valid JSON:
{
  "mismatches": [
    {
      "field": "snake_case_field_path",
      "label": "Human readable field name",
      "severity": "critical" | "warning" | "info",
      "expected": value from reference,
      "actual": value from policy,
      "note": "brief explanation"
    }
  ],
  "summary": "one sentence summary",
  "matchScore": 0-100
}

ONLY include items in "mismatches" when there is a MATERIAL difference that could affect coverage, premium, or legal terms.

DO NOT report (omit entirely):
- Capitalization, punctuation, "&" vs "and", or extra words like "Policy" in titles when meaning is the same
- Addresses where the policy adds pincode/country but the core location is identical
- Clause titles that are synonymous (e.g. "Earthquake Cover" vs "Earthquake (Fire & Shock) Cover") unless coverage scope clearly differs
- Identical numbers, dates, and names after normalizing case and whitespace

DO report as mismatches:
- Different policy numbers, sum insured, premium, or dates
- Missing or extra clauses/covers that change coverage
- Different insured name or materially different risk location
- Property breakdown amounts that differ

Severity guide:
- critical: wrong policy number, sums, premium, dates, missing coverage
- warning: extra clauses on policy, partial location change, clause scope may differ
- info: only use for genuine ambiguities needing human review (rare)

Placement slip (reference):
${JSON.stringify(reference, null, 2)}

Issued policy:
${JSON.stringify(policy, null, 2)}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = parseJsonFromResponse(raw);
  const validated = comparisonResultSchema.parse(parsed);
  return postProcessComparison(validated);
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("503") ||
      msg.includes("timeout") ||
      msg.includes("rate") ||
      msg.includes("unavailable") ||
      msg.includes("overloaded")
    );
  }
  return false;
}
