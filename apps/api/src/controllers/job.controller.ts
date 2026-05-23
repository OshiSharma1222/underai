import { Request, Response, NextFunction } from "express";
import { subscribeToJob } from "../lib/sse-hub";
import { comparisonService } from "../services/comparison.service";

export const jobController = {
  async compare(req: Request, res: Response, next: NextFunction) {
    try {
      const idempotencyKey = req.headers["idempotency-key"] as
        | string
        | undefined;
      const result = await comparisonService.startComparison(
        req.user!.userId,
        req.params.sessionId as string,
        req.body.documentIds,
        idempotencyKey
      );
      res.status(result.reused ? 200 : 202).json({
        jobId: result.job.id,
        status: result.job.status,
        reused: result.reused,
        items: result.items?.map((i) => ({
          id: i.id,
          documentId: i.documentId,
          status: i.status,
        })),
      });
    } catch (error) {
      next(error);
    }
  },

  async getJob(req: Request, res: Response, next: NextFunction) {
    try {
      const details = await comparisonService.getJob(
        req.params.jobId as string,
        req.user!.userId
      );
      res.json(details);
    } catch (error) {
      next(error);
    }
  },

  async streamEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const jobId = req.params.jobId as string;
      await comparisonService.getJob(jobId, req.user!.userId);

      const unsubscribe = subscribeToJob(jobId, res);

      req.on("close", () => {
        unsubscribe();
        res.end();
      });
    } catch (error) {
      next(error);
    }
  },
};
