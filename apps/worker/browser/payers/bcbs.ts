// Per-payer BCBS submitter.
//
// Order of preference inside this file:
//   1. Deterministic Playwright selectors against fields we've mapped from
//      observing the real portal. Stable, fast, debuggable.
//   2. Stagehand `act()` as a fallback when a step's selector isn't known yet.
//
// We start with selectors for the steps we've actually captured against a
// real portal, fall back to act() for the rest. Every payer-portal release
// can break selectors — when that happens, fix the selector here and
// re-deploy; the act() fallback keeps things limping in the meantime.

import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SubmitInput, SubmitResult } from "../types.js";

interface RunCtx {
  auditDir: string;
  env: "BROWSERBASE" | "LOCAL" | "FAKE";
}

const LOGIN_TIMEOUT_MS = 30_000;

// Selectors observed against the BCBS provider portal as of 2026-05.
// Update these here when the portal changes.
const SEL = {
  usernameField: 'input[name="username"], input#username, input[type="email"]',
  passwordField: 'input[name="password"], input#password, input[type="password"]',
  loginButton: 'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")',
  appealsLink: 'a:has-text("Appeals"), a:has-text("Claim Appeals"), nav a[href*="appeal"]',
  searchInput: 'input[name="claimNumber"], input[placeholder*="laim"]',
  fileAppealBtn: 'button:has-text("File Appeal"), button:has-text("Appeal"):not([disabled])',
  reasonSelect: 'select[name="appealReason"], select#appealReason',
  narrativeTextarea: 'textarea[name="narrative"], textarea#narrative, textarea[placeholder*="describe"]',
  submitBtn: 'button:has-text("Submit"):not([disabled])',
  confirmationText: '[data-testid="confirmation"], .confirmation-number, p:has-text("Confirmation")',
};

export async function submitToBcbs(input: SubmitInput, ctx: RunCtx): Promise<SubmitResult> {
  mkdirSync(ctx.auditDir, { recursive: true });
  const screenshots: string[] = [];
  const snap = (name: string, body: Buffer | string) => {
    const path = join(ctx.auditDir, name);
    writeFileSync(path, body);
    screenshots.push(path);
  };

  // Hard fail fast if credentials weren't passed — we won't blunder into a
  // login screen with no plan for getting through it.
  if (!input.credentials) {
    return {
      success: false,
      channel: "PORTAL",
      submitted_at: new Date().toISOString(),
      screenshots,
      errorMessage:
        "no PayerCredential stored for this (practice, BCBS) — set credentials in /settings/payers/<id>",
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

    // ─── Login (deterministic) ───────────────────────────────────────────
    try {
      await page.locator(SEL.usernameField).first().fill(username, { timeout: LOGIN_TIMEOUT_MS });
      await page.locator(SEL.passwordField).first().fill(password);
      await page.locator(SEL.loginButton).first().click();
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      // Fallback to LLM-steered login if selectors miss
      await page.act(
        `log in using username ${username} and the provided password. Do not echo the password.`,
      );
    }
    snap("02-logged-in.png", await page.screenshot());

    // ─── Navigate to appeals (LLM steering — varies more by portal) ─────
    await page.act("navigate to the claim appeals section");
    snap("03-appeals-section.png", await page.screenshot());

    // ─── Find claim ─────────────────────────────────────────────────────
    try {
      await page.locator(SEL.searchInput).first().fill(input.appeal.claim_control_number);
      await page.keyboard.press("Enter");
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act(`search for claim number ${input.appeal.claim_control_number}`);
    }
    snap("04-claim-found.png", await page.screenshot());

    await page.act("click the 'file appeal' button for that claim");
    snap("05-appeal-form.png", await page.screenshot());

    // ─── Fill appeal form ───────────────────────────────────────────────
    try {
      await page
        .locator(SEL.reasonSelect)
        .first()
        .selectOption({ label: input.appeal.primary_reason });
    } catch {
      await page.act(
        `select the appeal reason that best matches: ${input.appeal.primary_reason}`,
      );
    }
    try {
      await page.locator(SEL.narrativeTextarea).first().fill(input.appeal.letter);
    } catch {
      await page.act(
        `paste the following appeal letter into the narrative field: ${input.appeal.letter}`,
      );
    }
    snap("06-letter-pasted.png", await page.screenshot());

    // ─── Submit ─────────────────────────────────────────────────────────
    try {
      await page.locator(SEL.submitBtn).first().click();
      await page.waitForLoadState("networkidle", { timeout: LOGIN_TIMEOUT_MS });
    } catch {
      await page.act("review the submission and click submit");
    }
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
