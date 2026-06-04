// Medicare (CMS) portal submitter.
//
// Supports Medicare (CMS) provider portal for claim appeals.
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

// Medicare portal selectors (2026-05)
const SEL = {
  usernameField: 'input[name="user"], input#user, input[type="email"]',
  passwordField: 'input[name="password"], input#password, input[type="password"]',
  loginButton: 'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")',
  appealsTab: 'a:has-text("Appeals"), nav a[href*="appeal"]',
  claimIdInput: 'input[name="claimId"], input#claimId, input[placeholder*="Claim"]',
  searchClaimsBtn: 'button:has-text("Search"), button:has-text("Find Claim")',
  fileAppealBtn: 'button:has-text("File Appeal"), button:has-text("Request Appeal")',
  appealLevel: 'input[type="radio"][name="level"], select[name="appealLevel"]',
  appealReason: 'select[name="reason"], select[name="appealReason"]',
  additionalInfoTextarea: 'textarea[name="additionalInfo"], textarea#additionalInfo, textarea[placeholder*="additional"]',
  uploadDocumentsBtn: 'button:has-text("Upload"), button:has-text("Attach")',
  fileUpload: 'input[type="file"]',
  submitAppealBtn: 'button:has-text("Submit"), button:has-text("Send Appeal")',
  confirmation: '.confirmation, [data-testid="confirmation"], h3:has-text("Confirmation"), div:has-text("Tracking Number")',
};

export async function submitToMedicare(input: SubmitInput, ctx: RunCtx): Promise<SubmitResult> {
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
      errorMessage: "no PayerCredential stored for this (practice, Medicare) — set credentials in /settings/payers/<id>",
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

      // Handle potential multi-step authentication
      try {
        await page.waitForURL("**/verify", { timeout: 5000 });
        await page.act("complete any additional verification steps");
      } catch {
        // No additional verification
      }

      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act(`log in using username ${username} and the provided password. Complete any verification steps.`);
    }
    snap("02-logged-in.png", await page.screenshot());

    // Navigate to appeals
    await page.act("navigate to the appeals or claim appeals section");
    snap("03-appeals-section.png", await page.screenshot());

    // Search for claim
    try {
      await page.locator(SEL.claimIdInput).first().fill(input.appeal.claim_control_number);
      if (await page.locator(SEL.searchClaimsBtn).count() > 0) {
        await page.locator(SEL.searchClaimsBtn).first().click();
      } else {
        await page.keyboard.press("Enter");
      }
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act(`search for claim ID ${input.appeal.claim_control_number}`);
    }
    snap("04-claim-found.png", await page.screenshot());

    await page.act("click the button to file an appeal or request an appeal for this claim");
    snap("05-appeal-started.png", await page.screenshot());

    // Select appeal level (if applicable)
    try {
      if (await page.locator(SEL.appealLevel).count() > 0) {
        // Select first available level or default
        await page.locator(SEL.appealLevel).first().click();
      }
    } catch {
      await page.act("select the appropriate appeal level if prompted");
    }

    // Select appeal reason
    try {
      if (await page.locator(SEL.appealReason).count() > 0) {
        await page.locator(SEL.appealReason).first().selectOption({
          label: new RegExp(input.appeal.primary_reason, "i"),
        });
      } else {
        await page.act(`select the appeal reason that matches: ${input.appeal.primary_reason}`);
      }
    } catch {
      await page.act(`select the appeal reason that matches: ${input.appeal.primary_reason}`);
    }

    // Fill additional information
    try {
      await page.locator(SEL.additionalInfoTextarea).first().fill(input.appeal.letter);
    } catch {
      await page.act(`paste the following appeal letter into the additional information field: ${input.appeal.letter}`);
    }
    snap("06-details-entered.png", await page.screenshot());

    // Upload supporting documents
    if (await page.locator(SEL.uploadDocumentsBtn).count() > 0) {
      await page.act("upload any required medical records or supporting documentation");
      snap("07-uploads.png", await page.screenshot());
    }

    // Submit appeal
    try {
      await page.locator(SEL.submitAppealBtn).first().click();
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act("review and submit the appeal request");
    }
    snap("08-submitted.png", await page.screenshot());

    const extracted = await page.extract({
      instruction: "extract the confirmation or tracking number from the page",
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
