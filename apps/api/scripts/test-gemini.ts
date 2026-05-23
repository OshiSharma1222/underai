import "../src/load-env";
import { GoogleGenerativeAI } from "@google/generative-ai";

const models = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-2.0-flash",
];

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("No GEMINI_API_KEY");
    process.exit(1);
  }
  const genAI = new GoogleGenerativeAI(key);

  for (const model of models) {
    try {
      const r = await genAI.getGenerativeModel({ model }).generateContent("Say OK");
      console.log(`${model}: OK — ${r.response.text().trim()}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${model}: FAIL — ${msg.slice(0, 120)}`);
    }
  }
}

main();
