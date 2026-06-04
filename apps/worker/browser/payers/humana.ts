// Humana portal submitter.
//
// Supports Humana provider portal for claim appeals.
// Uses deterministic Playwright selectors with Stagehand fallback.

import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SubmitInput, SubmitResult } from "../types.js";

interface RunCtx {
  auditDir: string;
  env: "BROWSERBASE" | "LOCAL" | "FAKE";
}

const LOGIN_TIMEOUT_MS = 30_000;

// Humana portal selectors (2026-05)
const SEL = {
  usernameField: 'input[name="username"], input#userId, input[type="email"]',
  passwordField: 'input[name="password"], input#password, input[type="password"]',
  loginButton: 'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")',
  claimsMenu: 'a:has-text("Claims"), nav a[href*="claim"]',
  appealsLink: 'a:has-text("Appeals"), a:has-text("Disagreement"), button:has-text("Appeal")',
  claimNumberInput: 'input[name="claimNumber"], input#claimNumber, input[placeholder*="Claim"]',
  findClaimBtn: 'button:has-text("Find"), button:has-text("Search"), button:has-text("Locate")',
  startAppealBtn: 'button:has-text("Start Appeal"), button:has-text("Initiate Appeal")',
  appealReason: 'select[name="reason"], select[name="disagreementReason"], select#reason',
  explanationTextarea: 'textarea[name="explanation"], textarea#explanation, textarea[placeholder*="explanation"]',
  attachFilesBtn: 'button:has-text("Attach"), button:has-text("Upload")',
  fileInput: 'input[type="file"]',
  submitBtn: 'button:has-text("Submit Appeal"), button:has-text("Send")',
  confirmationId: '.confirmation-id, [data-testid="confirmation"], p:has-text("Confirmation"), span:has-text("Reference")',
};

export async function submitToHumana(input: SubmitInput, ctx: RunCtx): Promise<SubmitResult> {
  mkdirSync(ctx.auditDir, { recursive: true });
  const screenshots: string[] = [];
  const snap = (name: string, body: Buffer | string) => {
    const path = join(ctx.auditDir, name);
    writeFileSync(path, body);
    screenshots.push(path);
  };

  if (!input.credentials) {
    return {
      success: false,
      channel: "PORTAL",
      submitted_at: new Date().toISOString(),
      screenshots,
      errorMessage: "no PayerCredential stored for this (practice, Humana) — set credentials in /settings/payers/<id>",
    };
  }
  const { username, password } = input.credentials;

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

    // Login
    try {
      await page.locator(SEL.usernameField).first().fill(username, { timeout: LOGIN_TIMEOUT_MS });
      await page.locator(SEL.passwordField).first().fill(password);
      await page.locator(SEL.loginButton).first().click();

      // Handle security questions if present
      try {
        await page.waitForURL("**/security", { timeout: 5000 });
        await page.act("answer any security questions using the provided information");
      } catch {
        // No security questions
      }

      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act(`log in using username ${username} and the provided password. Handle any security questions.`);
    }
    snap("02-logged-in.png", await page.screenshot());

    // Navigate to claims/appeals
    await page.act("navigate to the claims menu and appeals section");
    snap("03-claims-section.png", await page.screenshot());

    await page.act("find and click on the appeals or disagreement link");
    snap("04-appeals-section.png", await page.screenshot());

    // Search for claim
    try {
      await page.locator(SEL.claimNumberInput).first().fill(input.appeal.claim_control_number);
      if (await page.locator(SEL.findClaimBtn).count() > 0) {
        await page.locator(SEL.findClaimBtn).first().click();
      } else {
        await page.keyboard.press("Enter");
      }
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act(`search for claim number ${input.appeal.claim_control_number}`);
    }
    snap("05-claim-found.png", await page.screenshot());

    await page.act("click the button to start an appeal or initiate an appeal for this claim");
    snap("06-appeal-started.png", await page.screenshot());

    // Select appeal reason
    try {
      if (await page.locator(SEL.appealReason).count() > 0) {
        await page.locator(SEL.appealReason).first().selectOption({
          label: new RegExp(input.appeal.primary_reason, "i"),
        });
      } else {
        await page.act(`select the appeal or disagreement reason that matches: ${input.appeal.primary_reason}`);
      }
    } catch {
      await page.act(`select the appeal or disagreement reason that matches: ${input.appeal.primary_reason}`);
    }

    // Fill explanation
    try {
      await page.locator(SEL.explanationTextarea).first().fill(input.appeal.letter);
    } catch {
      await page.act(`paste the following appeal letter into the explanation field: ${input.appeal.letter}`);
    }
    snap("07-details-entered.png", await page.screenshot());

    // Upload attachments if required
    if (await page.locator(SEL.attachFilesBtn).count() > 0) {
      await page.act("upload any required supporting documentation");
      snap("08-uploads.png", await page.screenshot());
    }

    // Submit appeal
    try {
      await page.locator(SEL.submitBtn).first().click();
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act("review and submit the appeal");
    }
    snap("09-submitted.png", await page.screenshot());

    const extracted = await page.extract({
      instruction: "extract the confirmation or reference number from the page",
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
