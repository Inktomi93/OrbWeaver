// Unit: THE FORM BRIDGE lifecycle + stale-handle guards (features/preset/lib/preset-editor-bridge). This
// is the ONE net-new piece of machinery (BUILD-SPEC §2.3) and the highest-risk item — tested thoroughly.
// PURE module-state paths (publish / clear / read / republish + `resolveAssemblySection`'s three guard
// branches) run in the node lane; the `useSyncExternalStore` SUBSCRIPTION firing needs a browser render
// and lives in the sibling CT (preset-editor-bridge.ct.tsx).
//
// The form handle here is a MINIMAL fake: the guard only reads `form.state.values.sections`, so a
// hand-built object cast to the 20+-generic AppFormInstance is enough — a real TanStack form is a hook,
// unconstructable outside a render, and irrelevant to the pure guard logic.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach } from "vitest";
import {
  clearAssemblyForm,
  publishAssemblyForm,
  readAssemblyForm,
  resolveAssemblySection,
} from "../../../../../packages/client/src/features/preset/lib/preset-editor-bridge";
import type { AppFormInstance } from "../../../../../packages/client/src/forms";
import { expect, test } from "../../../../support/fixtures";

const PRESET_A = castId<PresetId>("preset_bridgeaaaaaaa");
const PRESET_B = castId<PresetId>("preset_bridgebbbbbbb");

// A fake AppFormInstance exposing only `state.values.sections` — the sole surface the guard touches. A
// real AppFormInstance is a TanStack hook (unconstructable outside a render) with a 20+-generic type;
// the guard logic under test only reads `form.state.values.sections`, so the minimal fake is the honest
// input here (the reactive-hook path is covered by the sibling CT with a REAL form).
function fakeForm(sections: readonly PromptSection[]): AppFormInstance<PromptConfig> {
  const state = { values: { sections } };
  // FABRICATION-OK: AppFormInstance is a hook-only 20+-generic type; the guard reads only `.state.values.sections`.
  return { state } as unknown as AppFormInstance<PromptConfig>;
}

function section(id: string): PromptSection {
  return { type: "literal", id, name: id, role: "system", content: "x", enabled: true };
}

// The bridge is a module singleton — reset between tests so a leaked handle can't taint the next.
afterEach(() => {
  clearAssemblyForm();
});

test("publish then read returns the handle; clear resets to null", () => {
  expect(readAssemblyForm()).toBeNull();

  const form = fakeForm([section("s1")]);
  publishAssemblyForm({ presetId: PRESET_A, form });
  expect(readAssemblyForm()).toEqual({ presetId: PRESET_A, form });

  clearAssemblyForm();
  expect(readAssemblyForm()).toBeNull();
});

test("republish (a remount) replaces the prior handle with the fresh one", () => {
  const first = fakeForm([section("s1")]);
  const second = fakeForm([section("s2")]);
  publishAssemblyForm({ presetId: PRESET_A, form: first });
  publishAssemblyForm({ presetId: PRESET_A, form: second });

  expect(readAssemblyForm()?.form).toBe(second);
});

test("guard resolves a live section when handle + preset + id all match", () => {
  const form = fakeForm([section("s1"), section("s2")]);
  const handle = { presetId: PRESET_A, form };
  const resolved = resolveAssemblySection(handle, PRESET_A, "s2");

  expect(resolved).not.toBeNull();
  expect(resolved?.id).toBe("s2");
});

test("guard returns null on a null handle (no editor mounted)", () => {
  expect(resolveAssemblySection(null, PRESET_A, "s1")).toBeNull();
});

test("guard returns null when the published preset differs from the selected preset (mid-swap)", () => {
  const form = fakeForm([section("s1")]);
  const handle = { presetId: PRESET_A, form };
  // The LIST selected PRESET_B but the editor still publishes PRESET_A's handle.
  expect(resolveAssemblySection(handle, PRESET_B, "s1")).toBeNull();
});

test("guard returns null (never throws) on a stale section id after delete/undo", () => {
  const form = fakeForm([section("s1")]);
  const handle = { presetId: PRESET_A, form };
  // "s2" was deleted from the form but the inspector still holds its id.
  expect(resolveAssemblySection(handle, PRESET_A, "s2")).toBeNull();
});

test("guard returns null when no section is selected", () => {
  const form = fakeForm([section("s1")]);
  const handle = { presetId: PRESET_A, form };
  expect(resolveAssemblySection(handle, PRESET_A, null)).toBeNull();
});
