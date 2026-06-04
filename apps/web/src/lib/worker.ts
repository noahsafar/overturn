// Thin HTTP client for the internal worker (FastAPI). The worker exposes
// signed-internal endpoints for triggering Temporal workflows from the web
// app. In production these calls cross only the private VPC.

import "server-only";

const base = process.env.WORKER_INTERNAL_URL ?? "http://localhost:8001";

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`worker ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export const worker = {
  startDraft(denialId: string) {
    return call<{ workflowId: string; runId: string }>(
      "/internal/workflows/appeal/start",
      { denialId },
    );
  },
  submit(appealId: string) {
    return call<{ workflowId: string; runId: string }>(
      "/internal/workflows/appeal/submit",
      { appealId },
    );
  },
  status(workflowId: string) {
    return call<{ status: string; resultId?: string }>(
      `/internal/workflows/status`,
      { workflowId },
    );
  },
  aiEditAppeal(appealId: string, letter: string, prompt: string) {
    return call<{ letter: string }>(
      "/internal/ai-edit",
      { appealId, letter, prompt },
    );
  },
  ingestOutcomes(era: string) {
    return call<{
      updates: Array<{
        appealId: string;
        claimControlNumber: string;
        outcome: "WON" | "PARTIAL" | "LOST";
        recoveredAmount: number;
        feeCents: number;
        invoiceId: string;
      }>;
    }>("/internal/ingest-outcomes", { era });
  },

  extractClinicalContext(documentBase64: string, filename: string) {
    return call<{
      context: string;
      confidence: number;
      sections: Array<{
        title: string;
        content: string;
      }>;
    }>("/internal/extract-clinical-context", {
      document: documentBase64,
      filename,
    });
  },
};
