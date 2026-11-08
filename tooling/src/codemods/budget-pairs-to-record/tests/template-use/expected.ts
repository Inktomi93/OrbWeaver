import { budgets, loadPairs } from "@orb/tooling/floor/host/load-budget";

const CEILINGS_MS = budgets({ paintSettleResource: 5000 });

export const SCRIPT = `const resourceMs = ${CEILINGS_MS.paintSettleResource}; ${loadPairs().join(" ")}`;
