// Snap's one arm vocabulary. It is deliberately a leaf: fact schemas, run indices, and the arm plug-in
// contract all depend on these names, while none of those higher-level contracts owns the axis.
export const ARMS = [
  "dead-css",
  "aria",
  "eval",
  "contrast",
  "map",
  "assert",
  "design-audit",
  "app-snapshot",
  "heap",
  "filmstrip",
  "shot",
  "cascade",
  "requests",
  "lighthouse",
  "motion",
  "interaction-perf",
  "cpu-profile",
  "boot-trace",
  "react-profile",
] as const;

export type Arm = (typeof ARMS)[number];
