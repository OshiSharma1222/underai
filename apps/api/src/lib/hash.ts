import crypto from "crypto";
import fs from "fs/promises";

export async function hashFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function hashString(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
