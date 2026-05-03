import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

type MerchantAutomationTarget = "netflix" | "disney_plus" | "spotify" | "new_york_times";

export type CancelAutomationInput = {
  merchant: MerchantAutomationTarget;
  username: string;
  password: string;
  dryRun?: boolean;
  runId?: string;
  onLog?: (message: string, level?: "info" | "warn" | "error" | "success") => void;
};

type MerchantFlow = {
  loginUrl: string;
  steps: string[];
  selectors: {
    email: string[];
    password: string[];
    submit: string[];
  };
};

const merchantFlows: Record<MerchantAutomationTarget, MerchantFlow> = {
  netflix: {
    loginUrl: "https://www.netflix.com/login",
    steps: [
      "Go to account settings",
      "Open membership and billing",
      "Click cancel membership",
      "Confirm final cancellation screen"
    ],
    selectors: {
      email: ['input[type="email"]', 'input[name="userLoginId"]'],
      password: ['input[type="password"]'],
      submit: ['button[type="submit"]']
    }
  },
  disney_plus: {
    loginUrl: "https://www.disneyplus.com/login",
    steps: [
      "Open profile and account settings",
      "Go to subscription section",
      "Select cancel subscription",
      "Confirm cancellation reason and submit"
    ],
    selectors: {
      email: ['input[type="email"]', 'input[type="text"]'],
      password: ['input[type="password"]'],
      submit: ['button[type="submit"]']
    }
  },
  spotify: {
    loginUrl: "https://accounts.spotify.com/en/login",
    steps: [
      "Open your plan details",
      "Select change plan",
      "Choose cancel premium",
      "Confirm downgrade/cancellation"
    ],
    selectors: {
      email: ['input[type="email"]', 'input#login-username', 'input[type="text"]'],
      password: ['input[type="password"]', 'input#login-password'],
      submit: ['button[type="submit"]', 'button[data-testid="login-button"]']
    }
  },
  new_york_times: {
    loginUrl: "https://myaccount.nytimes.com/auth/login",
    steps: [
      "Open subscription overview",
      "Start cancel subscription flow",
      "Proceed through retention prompts",
      "Capture cancellation confirmation message"
    ],
    selectors: {
      email: ['input[type="email"]', 'input[type="text"]'],
      password: ['input[type="password"]'],
      submit: ['button[type="submit"]']
    }
  }
};

export async function runCancellationAutomation(input: CancelAutomationInput) {
  const flow = merchantFlows[input.merchant];
  if (!flow) {
    throw new Error(`Unsupported merchant: ${input.merchant}`);
  }

  const log = (message: string, level: "info" | "warn" | "error" | "success" = "info") => {
    input.onLog?.(message, level);
  };

  if (input.dryRun ?? true) {
    log(`Dry run for ${input.merchant} cancellation path prepared.`);
    return {
      merchant: input.merchant,
      mode: "dry_run",
      loginUrl: flow.loginUrl,
      plannedSteps: flow.steps
    };
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const runId = input.runId ?? `${Date.now()}`;
  const screenshotDir = join(process.cwd(), "artifacts", "cancellation-runs", runId);
  await mkdir(screenshotDir, { recursive: true });

  try {
    log(`Launching browser for ${input.merchant}.`);
    await page.goto(flow.loginUrl, { waitUntil: "domcontentloaded" });
    await page.screenshot({ path: join(screenshotDir, "01-login-page.png"), fullPage: true });
    log(`Opened login page: ${flow.loginUrl}`);

    // Selector paths vary frequently by merchant. We keep automation conservative:
    // - login + navigation are enabled,
    // - final destructive click should remain under explicit QA before production.
    let emailFilled = false;
    for (const selector of flow.selectors.email) {
      try {
        await page.fill(selector, input.username);
        log(`Filled username/email field via ${selector}`);
        emailFilled = true;
        break;
      } catch {
        // try next
      }
    }

    let passwordFilled = false;
    for (const selector of flow.selectors.password) {
      try {
        await page.fill(selector, input.password);
        log(`Filled password field via ${selector}`);
        passwordFilled = true;
        break;
      } catch {
        // try next
      }
    }

    await page.screenshot({ path: join(screenshotDir, "02-credentials-filled.png"), fullPage: true });

    for (const selector of flow.selectors.submit) {
      try {
        await page.click(selector, { timeout: 1500 });
        log(`Triggered submit click via ${selector}`);
        break;
      } catch {
        // try next
      }
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(screenshotDir, "03-post-submit.png"), fullPage: true });
    log("Recorded post-submit screenshot for audit trail.");

    return {
      merchant: input.merchant,
      mode: "executed_partial",
      loginUrl: flow.loginUrl,
      plannedSteps: flow.steps,
      note: "Login fields attempted with selector registry. Complete destructive cancellation selectors after merchant QA.",
      selectorOutcome: {
        emailFilled,
        passwordFilled
      },
      screenshotDir
    };
  } finally {
    log("Closing browser context.");
    await context.close();
    await browser.close();
  }
}
