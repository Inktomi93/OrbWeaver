// Wire-output builder for a preset read (`preset.get`, `preset.create`, `preset.update`): a user generation
// preset over the contract's default prompt config. An override is spread after the defaults.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type PresetDetailWire = TrpcWireOutput<"preset.get">;

export function makePresetDetail(overrides: Partial<PresetDetailWire> = {}): PresetDetailWire {
  return {
    id: ids.next(ID_PREFIX.preset),
    name: "Preset",
    kind: "generation",
    isSystemDefault: false,
    forkedFrom: null,
    configUnreadable: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    config: DEFAULT_PROMPT_CONFIG,
    schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
    ...overrides,
  };
}

type PresetSummaryWire = TrpcWireOutput<"preset.list">[number];

/** One `preset.list` row: a user generation preset without its config. */
export function makePresetSummary(overrides: Partial<PresetSummaryWire> = {}): PresetSummaryWire {
  return {
    id: ids.next(ID_PREFIX.preset),
    name: "Preset",
    kind: "generation",
    isSystemDefault: false,
    forkedFrom: null,
    configUnreadable: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}
