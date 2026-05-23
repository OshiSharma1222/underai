import { Request, Response, NextFunction } from "express";
import { sessionService } from "../services/session.service";

export const sessionController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await sessionService.createSession(
        req.user!.userId,
        req.body.name
      );
      res.status(201).json({ session });
    } catch (error) {
      next(error);
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await sessionService.getSession(
        req.user!.userId,
        req.params.sessionId as string
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  },

  async uploadReference(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ error: { message: "No file uploaded" } });
        return;
      }
      const result = await sessionService.uploadReference(
        req.user!.userId,
        req.params.sessionId as string,
        req.file
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },

  async retryReferenceExtraction(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const version = await sessionService.retryReferenceExtraction(
        req.user!.userId,
        req.params.sessionId as string
      );
      res.json({ version, extracted: true });
    } catch (error) {
      next(error);
    }
  },

  async uploadPolicies(req: Request, res: Response, next: NextFunction) {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) {
        res.status(400).json({ error: { message: "No files uploaded" } });
        return;
      }
      const result = await sessionService.uploadPolicies(
        req.user!.userId,
        req.params.sessionId as string,
        files
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
};
