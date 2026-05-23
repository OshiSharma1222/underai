import { z } from "zod";

export const propertyInsuredItemSchema = z.object({
  component: z.string(),
  sumInsured: z.number(),
});

export const normalizedInsuranceSchema = z.object({
  documentType: z.enum(["placement_slip", "policy"]),
  slipNumber: z.string().optional(),
  policyNumber: z.string().optional(),
  insuranceCompany: z.string().optional(),
  insuredName: z.string().optional(),
  policyType: z.string().optional(),
  policyPeriodStart: z.string().optional(),
  policyPeriodEnd: z.string().optional(),
  riskLocation: z.string().optional(),
  totalSumInsured: z.number().optional(),
  premium: z.number().optional(),
  issuedAt: z.string().optional(),
  propertyInsured: z.array(propertyInsuredItemSchema).default([]),
  clauses: z.array(z.string()).default([]),
  generalConditions: z.array(z.string()).default([]),
  generalExclusions: z.array(z.string()).default([]),
  addOnCovers: z.array(z.string()).default([]),
});

export type NormalizedInsurance = z.infer<typeof normalizedInsuranceSchema>;

export const mismatchSchema = z.object({
  field: z.string(),
  label: z.string(),
  severity: z.enum(["critical", "warning", "info"]),
  expected: z.union([z.string(), z.number(), z.array(z.string()), z.null()]),
  actual: z.union([z.string(), z.number(), z.array(z.string()), z.null()]),
  note: z.string().optional(),
});

export type Mismatch = z.infer<typeof mismatchSchema>;

export const comparisonResultSchema = z.object({
  mismatches: z.array(mismatchSchema),
  summary: z.string(),
  matchScore: z.number().min(0).max(100).optional(),
});

export type ComparisonResult = z.infer<typeof comparisonResultSchema>;

export const EXTRACTION_JSON_SCHEMA = `{
  "documentType": "placement_slip" | "policy",
  "slipNumber": "string optional",
  "policyNumber": "string optional",
  "insuranceCompany": "string optional",
  "insuredName": "string optional",
  "policyType": "string optional",
  "policyPeriodStart": "YYYY-MM-DD optional",
  "policyPeriodEnd": "YYYY-MM-DD optional",
  "riskLocation": "string optional",
  "totalSumInsured": "number in INR optional",
  "premium": "number in INR optional",
  "issuedAt": "string optional",
  "propertyInsured": [{ "component": "string", "sumInsured": number }],
  "clauses": ["string"],
  "generalConditions": ["string"],
  "generalExclusions": ["string"],
  "addOnCovers": ["string"]
}`;
