// Unit: The Assembly view-model helpers (features/preset/lib/assembly-model). PURE, node lane, DEEP import
// (not the feature barrel — dom-less graph). Proves the section-KIND split, the Triggers-pill label
// formatter, the addable-marker menu (a placed marker is omitted), and makeSection's
// fresh-id shape (BUILD-SPEC §3.2/§3.3/§3.5).

import type { GenerationType, PromptSection } from "@orb/contracts/preset";
import {
  addableSections,
  guidedFooterState,
  hasRoleField,
  makeSection,
  sectionKind,
  triggersPillLabel,
} from "../../../../../packages/client/src/features/preset/lib/assembly-model";
import { expect, test } from "../../../../support/fixtures";

// The literal branch carries the optional `trigger` (a `GenerationType[]`); indexing `PromptSection["trigger"]`
// would fail since the plain-marker branch has no such field, so annotate the element array directly.
function literal(id: string, trigger?: GenerationType[]): PromptSection {
  return {
    type: "literal",
    id,
    name: id,
    role: "system",
    content: "x",
    enabled: true,
    ...(trigger ? { trigger } : {}),
  };
}

test("sectionKind splits literal / templated marker / plain marker", () => {
  expect(sectionKind(literal("a"))).toBe("literal");
  expect(
    sectionKind({
      type: "marker",
      id: "m",
      name: "m",
      marker: "main_prompt",
      role: "system",
      enabled: true,
    }),
  ).toBe("templatedMarker");
  expect(
    sectionKind({
      type: "marker",
      id: "h",
      name: "h",
      marker: "chat_history",
      role: "system",
      enabled: true,
    }),
  ).toBe("plainMarker");
});

test("chat_history has NO role field; other sections do", () => {
  expect(
    hasRoleField({
      type: "marker",
      id: "h",
      name: "h",
      marker: "chat_history",
      role: "system",
      enabled: true,
    }),
  ).toBe(false);
  expect(hasRoleField(literal("a"))).toBe(true);
});

test("triggersPillLabel: undefined / empty trigger yields no pill", () => {
  expect(triggersPillLabel(undefined)).toBeNull();
  expect(triggersPillLabel([])).toBeNull();
});

test("triggersPillLabel: lists the turn-types' human labels, comma-joined", () => {
  expect(triggersPillLabel(["swipe"])).toBe("Swipe");
  expect(triggersPillLabel(["swipe", "quiet"])).toBe("Swipe, Quiet");
});

test("addableSections offers a literal + every marker NOT already placed", () => {
  const placed: PromptSection[] = [{ type: "marker", id: "h", name: "h", marker: "chat_history", role: "system", enabled: true }];
  const options = addableSections(placed);
  expect(options[0]?.marker).toBe(null); // literal first
  const markers = options.map((o) => o.marker);
  expect(markers).not.toContain("chat_history"); // placed → omitted
  expect(markers).toContain("main_prompt"); // absent → offered
});

test("makeSection mints a fresh id and the right shape", () => {
  const lit = makeSection(null);
  expect(lit.type).toBe("literal");
  expect(lit.id.length).toBeGreaterThan(0);

  const marker = makeSection("persona");
  expect(marker.type === "marker" ? marker.marker : null).toBe("persona");
  expect(makeSection(null).id).not.toBe(makeSection(null).id); // unique ids
});

// F8 — the guided-action card footer truth: an EMPTY template is the ghosted DEFAULT (not "Customized"),
// and the missing-`{{input}}` lint must NOT fire for it (bare input is exactly what lands; the old copy
// claiming "won't land anywhere" was false). A default-equal template is default; a real customization is
// not; a non-empty template that dropped `{{input}}` DOES trip the lint.
const GUIDED_DEFAULT = "Write your reply. {{input}}";

test("guidedFooterState: an empty template is the ghosted default with no missing-input lint (F8)", () => {
  const state = guidedFooterState("", GUIDED_DEFAULT);
  expect(state.isEmpty).toBe(true);
  expect(state.isDefault).toBe(true);
  expect(state.missingInputLint).toBe(false);
});

test("guidedFooterState: a whitespace-only template is treated as empty (F8)", () => {
  expect(guidedFooterState("   \n\t ", GUIDED_DEFAULT)).toEqual({ isEmpty: true, isDefault: true, missingInputLint: false });
});

test("guidedFooterState: a template equal to the factory default reads as default (F8)", () => {
  const state = guidedFooterState(GUIDED_DEFAULT, GUIDED_DEFAULT);
  expect(state.isDefault).toBe(true);
  expect(state.isEmpty).toBe(false);
  expect(state.missingInputLint).toBe(false);
});

test("guidedFooterState: a non-empty template that DROPS {{input}} trips the lint (F8)", () => {
  const state = guidedFooterState("Write a reply with no token", GUIDED_DEFAULT);
  expect(state.isEmpty).toBe(false);
  expect(state.isDefault).toBe(false);
  expect(state.missingInputLint).toBe(true);
});

test("guidedFooterState: a customized template carrying {{input}} is not default and not linted (F8)", () => {
  const state = guidedFooterState("Steer it darker: {{input}}", GUIDED_DEFAULT);
  expect(state.isDefault).toBe(false);
  expect(state.missingInputLint).toBe(false);
});
