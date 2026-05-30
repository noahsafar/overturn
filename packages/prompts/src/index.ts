import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load templates once at import. Each prompt has a version string baked into
// its filename — bump the version when changing prompts, so retired versions
// remain auditable for past LLM runs (Langfuse trace replay).
const strategizeV1 = readFileSync(join(__dirname, "strategize.v1.md"), "utf8");
const draftV1 = readFileSync(join(__dirname, "draft.v1.md"), "utf8");
const redraftV1 = readFileSync(join(__dirname, "redraft.v1.md"), "utf8");

export const PROMPTS = {
  strategize: { version: "v1", body: strategizeV1 },
  draft: { version: "v1", body: draftV1 },
  redraft: { version: "v1", body: redraftV1 },
} as const;

export function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined) {
      throw new Error(`Missing prompt variable: ${k}`);
    }
    return String(v);
  });
}
