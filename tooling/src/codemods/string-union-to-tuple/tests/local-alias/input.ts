import { x } from "./x.ts";

type OverflowPolicy = "lag" | "collapse";

export const policy: OverflowPolicy = x ? "lag" : "collapse";
