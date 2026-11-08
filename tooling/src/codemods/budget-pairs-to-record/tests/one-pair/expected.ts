import { budgets } from "../host/load-budget.ts";

export type NavOutcome = { readonly ok: true };

// A CEILING, load-scaled through the one policy: the literal is the QUIET-BOX base.
const CEILINGS_MS = budgets({ readyTimeout: 10_000 });

export async function ready(page: Page): Promise<void> {
  await page.locator("html").waitFor({ state: "attached", timeout: CEILINGS_MS.readyTimeout });
}
