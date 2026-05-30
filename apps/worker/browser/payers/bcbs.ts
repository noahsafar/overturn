// Per-payer BCBS submitter — Stagehand for steering, with a path to replace
// the `act()` calls with deterministic Playwright selectors once we've
// captured the portal's DOM. The dev spec calls this out: start with LLM
// steering for time-to-first-submission, swap to selectors for stability.

import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SubmitInput, SubmitResult } from "../types.js";

interface RunCtx {
  auditDir: string;
  env: "BROWSERBASE" | "LOCAL" | "FAKE";
}

export async function submitToBcbs(input: SubmitInput, ctx: RunCtx): Promise<SubmitResult> {
  mkdirSync(ctx.auditDir, { recursive: true });
  const screenshots: string[] = [];
  const snap = (name: string, body: Buffer | string) => {
    const path = join(ctx.auditDir, name);
    writeFileSync(path, body);
    screenshots.push(path);
  };

  // We use a dynamic import so that the stagehand/playwright deps are only
  // required when the env actually needs them. Pure unit tests / FAKE-mode
  // runs never load them.
  const { Stagehand } = await import("@browserbasehq/stagehand");

  const stagehand = new Stagehand({
    env: ctx.env === "BROWSERBASE" ? "BROWSERBASE" : "LOCAL",
    apiKey: process.env.BROWSERBASE_API_KEY,
    headless: process.env.HEADED !== "true",
  });
  await stagehand.init();
  const page = stagehand.page;

  try {
    if (!input.payer.portal_url) throw new Error("payer.portal_url missing");
    await page.goto(input.payer.portal_url);
    snap("01-loaded.png", await page.screenshot());

    await page.act("log in with the provided BCBS provider credentials");
    snap("02-logged-in.png", await page.screenshot());

    await page.act("navigate to the claim appeals section");
    snap("03-appeals-section.png", await page.screenshot());

    await page.act(`search for claim number ${input.appeal.claim_control_number}`);
    snap("04-claim-found.png", await page.screenshot());

    await page.act("click the 'file appeal' button for that claim");
    snap("05-appeal-form.png", await page.screenshot());

    await page.act(
      `select the appeal reason that best matches: ${input.appeal.primary_reason}`,
    );
    await page.act(
      `paste the following appeal letter into the narrative field: ${input.appeal.letter}`,
    );
    snap("06-letter-pasted.png", await page.screenshot());

    await page.act("review the submission and click submit");
    snap("07-submitted.png", await page.screenshot());

    const extracted = await page.extract({
      instruction: "extract the confirmation number from the page",
      schema: z.object({ confirmationNumber: z.string() }),
    });

    return {
      success: true,
      channel: "PORTAL",
      confirmation_number: extracted.confirmationNumber,
      submitted_at: new Date().toISOString(),
      screenshots,
    };
  } catch (err) {
    try {
      snap("ZZ-error.png", await page.screenshot());
    } catch {
      /* page may already be closed */
    }
    return {
      success: false,
      channel: "PORTAL",
      submitted_at: new Date().toISOString(),
      screenshots,
      errorMessage: (err as Error).message,
    };
  } finally {
    await stagehand.close();
  }
}
