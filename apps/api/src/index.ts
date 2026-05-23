import "./load-env";
import express from "express";
import cors from "cors";
import fs from "fs";
import { config } from "./lib/config";
import { router } from "./routes";
import { errorHandler } from "./middleware/error-handler";

fs.mkdirSync(config.uploadDir, { recursive: true });

const app = express();

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
app.use(express.json());

app.use(router);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);
});
