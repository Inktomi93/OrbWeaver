// `pnpm doc migrate-ledger`: the verb that split the legacy registry into one ADR file per ruling. The split
// landed as one commit and deleted the registry, so the verb has no input left; it refuses with that fact
// and the verb that mints a decision now, rather than failing as an unknown verb for a reader of a plan
// that still names it.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { WriteOutcome } from "./items.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc migrate-ledger");

export function migrateLedger(): WriteOutcome {
  return {
    written: [],
    refusals: ["the legacy registry is gone — the ledger split landed; each decision is docs/adr/NNNN-<slug>.md, and pnpm doc new adr <slug> mints one"],
  };
}
