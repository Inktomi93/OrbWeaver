import { budget } from "../../floor/host/load-budget.ts";

const SESSION_BOOT_BASE_MS = 240_000;
export const SESSION_BOOT_TIMEOUT_MS = budget(SESSION_BOOT_BASE_MS);
const SESSION_PING_BASE_MS = 5000;
const SESSION_PING_MS = budget(SESSION_PING_BASE_MS);

export function ping(): number {
  return SESSION_PING_MS;
}
