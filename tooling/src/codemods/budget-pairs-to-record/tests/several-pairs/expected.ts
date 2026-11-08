import { budgets } from "../../floor/host/load-budget.ts";

const RESOURCE_FETCH_RETRY_MS = 250;
/** Both ceilings ride `budget()`: a healthy run never reaches them. */
const CEILINGS_MS = budgets({ resourceFetchTimeout: 30_000, frontendNavTimeout: 30_000 });

export async function fetchAll(): Promise<void> {
  await fetch("a", { signal: AbortSignal.timeout(CEILINGS_MS.resourceFetchTimeout) });
  await sleep(RESOURCE_FETCH_RETRY_MS);
  await fetch("b", { signal: AbortSignal.timeout(CEILINGS_MS.resourceFetchTimeout) });
  await page.goto("c", { timeout: CEILINGS_MS.frontendNavTimeout });
}
