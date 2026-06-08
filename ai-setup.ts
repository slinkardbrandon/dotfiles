import { setupAiHarnessConfig } from "./src/ai-harness";

const force = process.argv.includes("--force");

await setupAiHarnessConfig({ force, interactive: true });
