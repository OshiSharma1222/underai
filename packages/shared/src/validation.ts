import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const createSessionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

export const compareSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1),
});

export const jobIdParamSchema = z.object({
  jobId: z.string().uuid(),
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid(),
});
