// DATED PROBE RECEIPTS ONLY — script name + date + value — for the DIRECT anthropic-messages wire. EMPTY still,
// deliberately: today's anthropic turn cells are id-regex derivations (D69), i.e. CURATED (`../curated/anthropic.ts`),
// and `historySystemRows` is explicitly UNMEASURED on every anthropic arm. The first entry here is what
// `pnpm probe:history-system-rows` against a real key may write (§8.0: only a dated measurement may relax
// `historySystemRows: false` / `roleHandlingFloor: "strict"`; D68 keeps the direct wire's sampling ranges
// fail-closed until a probe validates each model's honoured set). The 2026-09-20 direct-wire probes landed on
// the CURATED cells (the SDK's own capability table is the wire's truth — `@ai-sdk/anthropic` strips before
// sending — and A8's mandatory-thinking 400 is cited there); a measured row here is for a fact the curated
// cell cannot state. Same authoring form as every row module: `as const satisfies`, zod-parsed at load.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const measuredAnthropicRows = [] as const satisfies readonly CapabilityOverrideInput[];
