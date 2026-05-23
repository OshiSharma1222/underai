import dotenv from "dotenv";
import path from "path";

// Always load apps/api/.env (works for tsx src/ and node dist/)
dotenv.config({ path: path.resolve(__dirname, "../.env") });
