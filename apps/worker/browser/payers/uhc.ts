// UnitedHealthcare (UHC) portal submitter.
//
// Supports UHC provider portal for claim appeals.
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

// UHC portal selectors (2026-05)
const SEL = {
  usernameField: 'input[name="username"], input#userId, input[type="email"]',
  passwordField: 'input[name="password"], input#password, input[type="password"]',
  loginButton: 'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")',
  appealsLink: 'a:has-text("Appeals"), a:has-text("Claim Status"), nav a[href*="appeal"]',
  claimSearchInput: 'input[name="claimNumber"], input#claimNumber, input[placeholder*="Claim"]',
  searchButton: 'button:has-text("Search"), button:has-text("Find")',
  fileAppealBtn: 'button:has-text("File Appeal"), button:has-text("Appeal"), a:has-text("appeal")',
  appealReasonSelect: 'select[name="appealReason"], select#appealReason, select[name="reason"]',
  narrativeTextarea: 'textarea[name="narrative"], textarea#narrative, textarea[placeholder*="comments"]',
  attachmentUpload: 'input[type="file"]',
  submitBtn: 'button:has-text("Submit"), button:has-text("Send")',
  confirmationNumber: '.confirmation-number, [data-testid="confirmation"], p:has-text("Confirmation")',
};

export async function submitToUhc(input: SubmitInput, ctx: RunCtx): Promise<SubmitResult> {
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
      errorMessage: "no PayerCredential stored for this (practice, UHC) — set credentials in /settings/payers/<id>",
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

    // Login with MFA support
    try {
      await page.locator(SEL.usernameField).first().fill(username, { timeout: LOGIN_TIMEOUT_MS });
      await page.locator(SEL.passwordField).first().fill(password);
      await page.locator(SEL.loginButton).first().click();

      // Handle potential MFA
      try {
        await page.waitForURL("**/mfa", { timeout: 5000 });
        if (input.credentials.mfa_secret) {
          // Handle TOTP-based MFA if configured
          await page.act("enter the MFA code from your authenticator app");
        } else {
          await page.act("handle any multi-factor authentication that appears");
        }
      } catch {
        // No MFA required
      }

      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act(`log in using username ${username} and the provided password. Handle any MFA prompts.`);
    }
    snap("02-logged-in.png", await page.screenshot());

    // Navigate to appeals section
    await page.act("navigate to the claim appeals or claim status section");
    snap("03-appeals-section.png", await page.screenshot());

    // Search for claim
    try {
      await page.locator(SEL.claimSearchInput).first().fill(input.appeal.claim_control_number);
      if (await page.locator(SEL.searchButton).count() > 0) {
        await page.locator(SEL.searchButton).first().click();
      } else {
        await page.keyboard.press("Enter");
      }
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act(`search for claim number ${input.appeal.claim_control_number}`);
    }
    snap("04-claim-found.png", await page.screenshot());

    await page.act("click the 'file appeal' or 'appeal' button for this claim");
    snap("05-appeal-form.png", await page.screenshot());

    // Fill appeal form
    try {
      if (await page.locator(SEL.appealReasonSelect).count() > 0) {
        await page.locator(SEL.appealReasonSelect).first().selectOption({
          label: new RegExp(input.appeal.primary_reason, "i"),
        });
      } else {
        await page.act(`select the appeal reason that best matches: ${input.appeal.primary_reason}`);
      }
    } catch {
      await page.act(`select the appeal reason that best matches: ${input.appeal.primary_reason}`);
    }

    try {
      await page.locator(SEL.narrativeTextarea).first().fill(input.appeal.letter);
    } catch {
      await page.act(`paste the following appeal letter into the narrative field: ${input.appeal.letter}`);
    }
    snap("06-letter-pasted.png", await page.screenshot());

    // Handle document uploads if present
    if (await page.locator(SEL.attachmentUpload).count() > 0) {
      await page.act("upload any supporting documents if required");
      snap("07-uploads.png", await page.screenshot());
    }

    // Submit appeal
    try {
      await page.locator(SEL.submitBtn).first().click();
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act("review and submit the appeal");
    }
    snap("08-submitted.png", await page.screenshot());

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
