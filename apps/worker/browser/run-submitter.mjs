// CLI entrypoint — read SubmitInput from stdin (JSON), pick the right
// per-payer submitter, write the SubmitResult to stdout.
//
// Invoked by `apps/worker/src/claimwell_worker/submission.py` when
// STAGEHAND_ENV != "FAKE". For FAKE mode the Python side talks directly
// to the local fake portal and skips this entirely.

import { readFileSync } from "node:fs";

function main() {
  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw);
  const auditDir = process.env.AUDIT_DIR ?? "./artifacts/audit-screenshots";
  const env = process.env.STAGEHAND_ENV ?? "LOCAL";

  // Pick submitter by payer name. As more payers come online add cases
  // here; the generic LLM-steered fallback is a stop-gap, not a strategy.
  const name = (input.payer.name || "").toLowerCase();
  let submitter;
  if (name.includes("blue cross") || name.includes("bcbs")) {
    submitter = import("./payers/bcbs.ts").then((m) => m.submitToBcbs);
  } else {
    console.error(`no specific submitter for payer "${input.payer.name}" — failing`);
    process.exit(2);
  }

  submitter
    .then((fn) => fn(input, { auditDir, env }))
    .then((result) => {
      process.stdout.write(JSON.stringify(result) + "\n");
    })
    .catch((err) => {
      console.error(err);
      process.stdout.write(
        JSON.stringify({
          success: false,
          channel: "PORTAL",
          submitted_at: new Date().toISOString(),
          screenshots: [],
          errorMessage: err.message,
        }) + "\n",
      );
      process.exit(1);
    });
}

main();
