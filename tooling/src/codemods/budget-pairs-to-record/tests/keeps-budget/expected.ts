import { budget, budgets } from "../../floor/host/load-budget.ts";

const CEILINGS_MS = budgets({ stampTimeout: 15_000 });
const RELOAD_BASE_MS = 2000;

export function deadline(now: number): number {
  return now + CEILINGS_MS.stampTimeout + budget(RELOAD_BASE_MS);
}
