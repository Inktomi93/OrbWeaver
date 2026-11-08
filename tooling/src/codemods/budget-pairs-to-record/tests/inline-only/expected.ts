import { budget } from "../../floor/host/load-budget.ts";

const PROBE_TIMEOUT_BASE_MS = 2000;

export async function probe(url: string): Promise<boolean> {
  const timeoutMs = budget(PROBE_TIMEOUT_BASE_MS);
  return (await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })).ok;
}
