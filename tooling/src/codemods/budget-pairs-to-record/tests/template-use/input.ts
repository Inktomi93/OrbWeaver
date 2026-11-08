import { budget, loadPairs } from "@orb/tooling/floor/host/load-budget";

const PAINT_SETTLE_RESOURCE_BASE_MS = 5000;
const PAINT_SETTLE_RESOURCE_MS = budget(PAINT_SETTLE_RESOURCE_BASE_MS);

export const SCRIPT = `const resourceMs = ${PAINT_SETTLE_RESOURCE_MS}; ${loadPairs().join(" ")}`;
