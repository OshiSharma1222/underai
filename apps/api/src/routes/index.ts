import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {
  compareSchema,
  createSessionSchema,
  jobIdParamSchema,
  loginSchema,
  sessionIdParamSchema,
} from "@underai/shared";
import { authMiddleware } from "../middleware/auth";
import { validateBody, validateParams } from "../middleware/validate";
import { authController } from "../controllers/auth.controller";
import { sessionController } from "../controllers/session.controller";
import { jobController } from "../controllers/job.controller";
import { config } from "../lib/config";

const tmpDir = path.join(config.uploadDir, "_tmp");
const upload = multer({
  dest: tmpDir,
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

fs.mkdirSync(tmpDir, { recursive: true });

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/", (_req, res) => {
  res.json({
    name: "UnderAI Document Comparison API",
    status: "running",
    frontend: "http://localhost:3000",
    docs: {
      public: ["GET /health", "POST /auth/login"],
      protected:
        "All other routes require Authorization: Bearer <token> from /auth/login",
    },
  });
});

router.post("/auth/login", validateBody(loginSchema), authController.login);

router.use(authMiddleware);

router.post(
  "/sessions",
  validateBody(createSessionSchema),
  sessionController.create
);

router.get(
  "/sessions/:sessionId",
  validateParams(sessionIdParamSchema),
  sessionController.get
);

router.post(
  "/sessions/:sessionId/reference",
  validateParams(sessionIdParamSchema),
  upload.single("file"),
  sessionController.uploadReference
);

router.post(
  "/sessions/:sessionId/reference/retry-extract",
  validateParams(sessionIdParamSchema),
  sessionController.retryReferenceExtraction
);

router.post(
  "/sessions/:sessionId/documents",
  validateParams(sessionIdParamSchema),
  upload.array("files", 20),
  sessionController.uploadPolicies
);

router.post(
  "/sessions/:sessionId/compare",
  validateParams(sessionIdParamSchema),
  validateBody(compareSchema),
  jobController.compare
);

router.get(
  "/jobs/:jobId",
  validateParams(jobIdParamSchema),
  jobController.getJob
);

router.get(
  "/jobs/:jobId/events",
  validateParams(jobIdParamSchema),
  jobController.streamEvents
);
