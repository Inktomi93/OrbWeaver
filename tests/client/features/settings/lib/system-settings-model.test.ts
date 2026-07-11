// Unit: the System-settings delta writer (features/settings/lib/system-settings-model `diffSystemPatch`).
// Pure, no DOM — the node lane. Guards the F2 fix: a control toggled ON then BACK must emit an explicit
// `null` CLEAR (the server MERGES patches, so an omitted revert leaves the away override STUCK), while an
// env-mirrored field the admin never touched is NEVER pinned as a stored override (the standing env-floor
// law the diff exists to protect). The two-baseline contract: `original` = the inherited/default a revert
// clears back to; `lastSaved` = the last persisted state (change detection).

import type {
  SystemSettingsBaselines,
  SystemSettingsForm,
} from "../../../../../packages/client/src/features/settings/lib/system-settings-model";
import {
  BYTES_PER_MB,
  diffSystemPatch,
} from "../../../../../packages/client/src/features/settings/lib/system-settings-model";
import { expect, test } from "../../../../support/fixtures";

// The projection of the CT's resolved effective config (env floor ⊕ override — every field present).
const BASE: SystemSettingsForm = {
  corpusAutoindex: false,
  logLevel: "info",
  forbidExternalMedia: true,
  trustHtml: false,
  maxImageMb: 5,
  vllmEmbedConcurrency: 4,
  vllmSummarizeConcurrency: 2,
  allowNonOwnerLocalCompute: true,
  nonOwnerLocalComputeBudget: null,
  allowNonOwnerMaxProSub: false,
  localMultiUser: false,
  discreetLogin: false,
};

const form = (overrides: Partial<SystemSettingsForm>): SystemSettingsForm => ({
  ...BASE,
  ...overrides,
});

/** Both baselines seeded at the SAME state — a fresh mount before any save. */
const mounted = (state: SystemSettingsForm): SystemSettingsBaselines => ({
  original: state,
  lastSaved: state,
});

test("toggling a control ON writes ONLY that field's override — env-mirrored fields are never pinned", () => {
  const patch = diffSystemPatch(mounted(BASE), form({ trustHtml: true }));
  expect(patch).toEqual({ trustHtml: true });
});

test("toggling a control BACK to the inherited value emits an explicit null CLEAR, not an omitted key", () => {
  // Mount at trustHtml=false, an earlier autosave persisted `true` (lastSaved), the admin flips it back.
  const baselines: SystemSettingsBaselines = {
    original: form({ trustHtml: false }),
    lastSaved: form({ trustHtml: true }),
  };
  const patch = diffSystemPatch(baselines, form({ trustHtml: false }));
  // The KEY must be present with `null` (the server's documented CLEAR) — an omit would leave `true` stuck.
  expect(patch).toStrictEqual({ trustHtml: null });
  expect("trustHtml" in patch).toBe(true);
});

test("a governance toggle round-trip clears too (real-money posture never sticks)", () => {
  const baselines: SystemSettingsBaselines = {
    original: form({ allowNonOwnerMaxProSub: false }),
    lastSaved: form({ allowNonOwnerMaxProSub: true }),
  };
  expect(diffSystemPatch(baselines, form({ allowNonOwnerMaxProSub: false }))).toStrictEqual({
    allowNonOwnerMaxProSub: null,
  });
});

test("a field set to a NON-inherited value pins the value (an override the admin genuinely wants)", () => {
  const baselines: SystemSettingsBaselines = {
    original: form({ logLevel: "info" }),
    lastSaved: form({ logLevel: "info" }),
  };
  expect(diffSystemPatch(baselines, form({ logLevel: "debug" }))).toEqual({ logLevel: "debug" });
});

test("no change since the last save yields an empty patch — nothing is pinned", () => {
  expect(diffSystemPatch(mounted(BASE), BASE)).toEqual({});
});

test("changing ONE vLLM sub-key sends only that sub-key — the sibling is NOT pinned at its env value", () => {
  const patch = diffSystemPatch(mounted(BASE), form({ vllmEmbedConcurrency: 8 }));
  // The secondary F2 defect: the old diff sent { embed, summarize } and pinned summarize's env value.
  expect(patch).toEqual({ vllmConcurrency: { embed: 8 } });
});

test("reverting a vLLM sub-key while the sibling is untouched clears the whole nested override", () => {
  const baselines: SystemSettingsBaselines = {
    original: form({ vllmEmbedConcurrency: 4, vllmSummarizeConcurrency: 2 }),
    lastSaved: form({ vllmEmbedConcurrency: 8, vllmSummarizeConcurrency: 2 }),
  };
  expect(
    diffSystemPatch(baselines, form({ vllmEmbedConcurrency: 4, vllmSummarizeConcurrency: 2 })),
  ).toStrictEqual({ vllmConcurrency: null });
});

test("maxImageMb toggled up then back to the inherited MB clears the byte override", () => {
  const baselines: SystemSettingsBaselines = {
    original: form({ maxImageMb: 5 }),
    lastSaved: form({ maxImageMb: 20 }),
  };
  expect(diffSystemPatch(baselines, form({ maxImageMb: 5 }))).toStrictEqual({
    maxImageBytes: null,
  });
});

test("maxImageMb set to a new value sends BYTES (the MB→bytes projection)", () => {
  expect(diffSystemPatch(mounted(BASE), form({ maxImageMb: 20 }))).toEqual({
    maxImageBytes: 20 * BYTES_PER_MB,
  });
});

test("clearing the maxImageMb input (null) clears the override rather than sending an invalid value", () => {
  const baselines: SystemSettingsBaselines = {
    original: form({ maxImageMb: 5 }),
    lastSaved: form({ maxImageMb: 20 }),
  };
  expect(diffSystemPatch(baselines, form({ maxImageMb: null }))).toStrictEqual({
    maxImageBytes: null,
  });
});

test("a multi-field turn writes every moved field and no untouched env-mirrored one", () => {
  const patch = diffSystemPatch(
    mounted(BASE),
    form({ trustHtml: true, forbidExternalMedia: false, corpusAutoindex: true }),
  );
  expect(patch).toEqual({ trustHtml: true, forbidExternalMedia: false, corpusAutoindex: true });
  // The env-mirrored fields the admin never touched must be absent (never pinned to a DB copy).
  expect("logLevel" in patch).toBe(false);
  expect("vllmConcurrency" in patch).toBe(false);
  expect("allowNonOwnerLocalCompute" in patch).toBe(false);
});
