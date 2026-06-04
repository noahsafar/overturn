// Cigna portal submitter.
//
// Supports Cigna provider portal for claim appeals.
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

// Cigna portal selectors (2026-05)
const SEL = {
  usernameField: 'input[name="username"], input#userId, input[type="email"]',
  passwordField: 'input[name="password"], input#password, input[type="password"]',
  loginButton: 'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")',
  providerPortalTab: 'a:has-text("Provider"), nav a[href*="provider"]',
  claimsSection: 'a:has-text("Claims"), div:has-text("Claim Management")',
  appealsLink: 'a:has-text("Appeals"), a:has-text("Review"), button:has-text("Appeal")',
  claimSearchInput: 'input[name="claimNumber"], input#claimSearch, input[placeholder*="Claim"]',
  searchBtn: 'button:has-text("Search"), button:has-text("Find")',
  fileAppealBtn: 'button:has-text("File Appeal"), button:has-text("Request Review")',
  reasonDropdown: 'select[name="reason"], select[name="appealReason"], select#reason',
  commentsTextarea: 'textarea[name="comments"], textarea#narrative, textarea[placeholder*="comments"]',
  uploadDocsBtn: 'button:has-text("Upload"), button:has-text("Attach Documents")',
  fileUpload: 'input[type="file"]',
  submitReviewBtn: 'button:has-text("Submit"), button:has-text("Send")',
  confirmationMsg: '.confirmation, [data-testid="confirmation"], div:has-text("Confirmation #"), p:has-text("Reference")',
};

export async function submitToCigna(input: SubmitInput, ctx: RunCtx): Promise<SubmitResult> {
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
      errorMessage: "no PayerCredential stored for this (practice, Cigna) — set credentials in /settings/payers/<id>",
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

      // Handle potential MFA
      try {
        await page.waitForURL("**/verify", { timeout: 5000 });
        await page.act("handle any verification or multi-factor authentication");
      } catch {
        // No verification required
      }

      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act(`log in using username ${username} and the provided password. Handle any security verification.`);
    }
    snap("02-logged-in.png", await page.screenshot());

    // Navigate to claims/appeals
    await page.act("navigate to the provider portal and claims section");
    snap("03-claims-section.png", await page.screenshot());

    await page.act("find the appeals or review link and navigate to it");
    snap("04-appeals-section.png", await page.screenshot());

    // Search for claim
    try {
      await page.locator(SEL.claimSearchInput).first().fill(input.appeal.claim_control_number);
      if (await page.locator(SEL.searchBtn).count() > 0) {
        await page.locator(SEL.searchBtn).first().click();
      } else {
        await page.keyboard.press("Enter");
      }
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act(`search for claim number ${input.appeal.claim_control_number}`);
    }
    snap("05-claim-found.png", await page.screenshot());

    await page.act("click the button to file an appeal or request a review for this claim");
    snap("06-appeal-form.png", await page.screenshot());

    // Select appeal reason
    try {
      if (await page.locator(SEL.reasonDropdown).count() > 0) {
        await page.locator(SEL.reasonDropdown).first().selectOption({
          label: new RegExp(input.appeal.primary_reason, "i"),
        });
      } else {
        await page.act(`select the appeal reason that matches: ${input.appeal.primary_reason}`);
      }
    } catch {
      await page.act(`select the appeal reason that matches: ${input.appeal.primary_reason}`);
    }

    // Fill comments/narrative
    try {
      await page.locator(SEL.commentsTextarea).first().fill(input.appeal.letter);
    } catch {
      await page.act(`paste the following appeal letter into the comments field: ${input.appeal.letter}`);
    }
    snap("07-details-entered.png", await page.screenshot());

    // Upload documents if available
    if (await page.locator(SEL.uploadDocsBtn).count() > 0) {
      await page.act("upload any required supporting documents or medical records");
      snap("08-uploads.png", await page.screenshot());
    }

    // Submit appeal
    try {
      await page.locator(SEL.submitReviewBtn).first().click();
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act("review and submit the appeal request");
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
