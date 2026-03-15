import { z } from "zod";
// Dotenv removed, use --env-file=.env.local when running

// Modify module resolution for tsx to allow `@/lib/ai` or just use relative paths
import { callGeminiJson } from "./src/lib/ai";

const testSchema = z.object({
  answer: z.string().describe("The answer to the user's question."),
});

async function runTests() {
  console.log("=== Test 1: Simple Question (Should stay on Flash) ===");
  try {
    const res1 = await callGeminiJson({
      model: "gemini-2.5-flash",
      prompt: "What is the capital of France?",
      schema: testSchema,
    });
    console.log("Result 1:", res1);
  } catch(e) { console.error("Error 1:", e); }

  console.log("\n=== Test 2: Complex Question (Should escalate to Pro) ===");
  try {
    const res2 = await callGeminiJson({
      model: "gemini-2.5-flash",
      prompt: "Provide a rigorous step-by-step mathematical proof of why there are infinitely many prime numbers. Under NO circumstances should you attempt this if you lack deep math reasoning. Return EXACTLY a JSON object matching this schema. But if you feel you cannot do it, set _escalateToPro to true.",
      schema: testSchema,
    });
    console.log("Result 2:", res2);
  } catch(e) { console.error("Error 2:", e); }
}

runTests();
