import path from "path";
import "../load-env";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET", "dev-secret-change-in-production"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  port: parseInt(process.env.PORT ?? process.env.API_PORT ?? "4000", 10),
  uploadDir: path.resolve(
    __dirname,
    "../..",
    process.env.UPLOAD_DIR?.replace(/^\.\//, "") ?? "uploads"
  ),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? "10", 10),
};
