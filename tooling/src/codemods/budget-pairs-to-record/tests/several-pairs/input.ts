import { budget } from "../../floor/host/load-budget.ts";

const RESOURCE_FETCH_RETRY_MS = 250;
/** Both ceilings ride `budget()`: a healthy run never reaches them. */
const RESOURCE_FETCH_BASE_MS = 30_000;
const RESOURCE_FETCH_TIMEOUT_MS = budget(RESOURCE_FETCH_BASE_MS);
const FRONTEND_NAV_BASE_MS = 30_000;
const FRONTEND_NAV_TIMEOUT_MS = budget(FRONTEND_NAV_BASE_MS);

export async function fetchAll(): Promise<void> {
  await fetch("a", { signal: AbortSignal.timeout(RESOURCE_FETCH_TIMEOUT_MS) });
  await sleep(RESOURCE_FETCH_RETRY_MS);
  await fetch("b", { signal: AbortSignal.timeout(RESOURCE_FETCH_TIMEOUT_MS) });
  await page.goto("c", { timeout: FRONTEND_NAV_TIMEOUT_MS });
}
