// DATED PROBE RECEIPTS ONLY — script name + date + value. EMPTY at landing, deliberately: today's anthropic
// turn cells are id-regex derivations (D69), i.e. CURATED (`../curated/anthropic.json`), and
// `historySystemRows` is explicitly UNMEASURED on every anthropic arm. The first entry here is what
// `pnpm probe:history-system-rows` against a real key may write (§8.0: only a dated measurement may relax
// `historySystemRows: false` / `roleHandlingFloor: "strict"`; D68 keeps the direct wire's sampling ranges
// fail-closed until a probe validates each model's honoured set).

import type { CapabilityOverride } from "@orb/contracts/inference";

export const MEASURED_ANTHROPIC: readonly CapabilityOverride[] = [];
