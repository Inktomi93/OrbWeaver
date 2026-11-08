import { budget } from "../host/load-budget.ts";

export type NavOutcome = { readonly ok: true };

// A CEILING, load-scaled through the one policy: the literal is the QUIET-BOX base.
const READY_TIMEOUT_MS_BASE = 10_000;
const READY_TIMEOUT_MS = budget(READY_TIMEOUT_MS_BASE);

export async function ready(page: Page): Promise<void> {
  await page.locator("html").waitFor({ state: "attached", timeout: READY_TIMEOUT_MS });
}
