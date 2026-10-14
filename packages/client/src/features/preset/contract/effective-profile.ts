// Client-owned projections derive their production wire/input homes; computed presentation data stays local.

import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

export type EffectiveProfileRow = Pick<
  inferOutput<Trpc["preset"]["resolveEffective"]>,
  "cache" | "cacheWarnings" | "model" | "knobs" | "stale" | "qualityMapping"
>;

export type EffectiveKnobRow = Pick<WireKnobReading, "value"> & { readonly provenance: string };

export type WireKnobReading = NonNullable<EffectiveProfileRow["knobs"][keyof EffectiveProfileRow["knobs"]]>;
