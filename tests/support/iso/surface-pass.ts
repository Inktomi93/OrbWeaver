/** Measurement and evidence use the same journeys with separate instrumentation lifetimes. */
export const SURFACE_PASSES = ["measurement", "evidence"] as const;
export type SurfacePass = (typeof SURFACE_PASSES)[number];
export const SURFACE_HTTP_ANNOTATION = "surface-http";
