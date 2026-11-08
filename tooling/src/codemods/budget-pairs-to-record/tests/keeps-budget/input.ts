import { budget } from "../../floor/host/load-budget.ts";

const STAMP_BASE_MS = 15_000;
const STAMP_TIMEOUT_MS = budget(STAMP_BASE_MS);
const RELOAD_BASE_MS = 2000;

export function deadline(now: number): number {
  return now + STAMP_TIMEOUT_MS + budget(RELOAD_BASE_MS);
}
