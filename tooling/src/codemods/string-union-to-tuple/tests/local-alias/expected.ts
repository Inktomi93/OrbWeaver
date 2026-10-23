import { x } from "./x.ts";

const OVERFLOW_POLICIES = ["lag", "collapse"] as const;
type OverflowPolicy = (typeof OVERFLOW_POLICIES)[number];

export const policy: OverflowPolicy = x ? "lag" : "collapse";
