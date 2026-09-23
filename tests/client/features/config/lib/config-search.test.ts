// `buildConfigSearchEntries` + `filterConfigEntries` (features/config/lib/config-search.ts) — the Settings
// search's STATIC index derivation: group rows · section rows · setting
// leaves off the ONE nav derivation, `when`-hidden groups contributing NOTHING (search sees exactly what the
// LIST shows), the navLabel keyword parity (an abbreviation must never hide its section), and the typed
// `@` filter semantics — including `@modified` over a planted changed key and the `@advanced` flip.
// DOM-free pure logic → a browser-free unit test (Spine-Testing.md §7); deep-imports the lib module.

import type { ConfigGroupDefinition, ConfigGroupId, ConfigGroupRegistry, ConfigModifiedMap, ConfigSubcategory } from "@orb/client/state";
import { Settings } from "@orb/ui/icons";
import type { ConfigSearchEntry } from "../../../../../packages/client/src/features/config/lib/config-search.ts";
import { buildConfigSearchEntries, filterConfigEntries, isConfigEntryModified } from "../../../../../packages/client/src/features/config/lib/config-search.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function group(id: ConfigGroupId, shelf: ConfigGroupDefinition["shelf"], label: string): ConfigGroupDefinition {
  return { id, shelf, label, icon: Settings, description: `${label} — the description.`, body: { kind: "sections" } };
}

const APPEARANCE = group("appearance", "user", "Appearance");
const CONNECTIONS = group("connections", "app", "Connections");
const ADMIN = group("admin", "app", "Admin");

const ROWS: Readonly<Partial<Record<ConfigGroupId, readonly ConfigSubcategory[]>>> = {
  appearance: [
    {
      id: "message-details",
      label: "Message details & actions",
      navLabel: "Chips",
      keywords: ["metadata"],
      settings: [
        { id: "avatar-size", label: "Avatar size", keywords: ["scale"], teach: { summary: "A fixture lesson.", affects: ["a fixture surface"] } },
        { id: "debug-grid", label: "Layout debug grid", advanced: true, teach: { none: "a fixture leaf — the search axis is the subject" } },
      ],
    },
  ],
  connections: [{ id: "model-roles", label: "Model roles" }],
  admin: [{ id: "users", label: "Users" }],
};

function registryOf(groups: readonly ConfigGroupDefinition[]): ConfigGroupRegistry {
  const byId = new Map(groups.map((g) => [g.id, g]));
  return {
    name: "test",
    get: (id): ConfigGroupDefinition => byId.get(id) as ConfigGroupDefinition,
    list: (): readonly ConfigGroupDefinition[] => groups,
    has: (id): boolean => byId.has(id),
  };
}

const NO_FILTER = { modified: false, advanced: false } as const;
const NO_MODIFIED: ConfigModifiedMap = { subs: new Map(), settings: new Set() };

function build(visible: (id: ConfigGroupId) => boolean = () => true): readonly ConfigSearchEntry[] {
  return buildConfigSearchEntries(registryOf([APPEARANCE, CONNECTIONS, ADMIN]), visible, (g) => ROWS[g.id] ?? []);
}

test("the derivation: one group row, one row per section, one per leaf — each carrying its full address", () => {
  const entries = build();
  expect(entries.map((e) => e.id)).toEqual([
    "appearance",
    "appearance::message-details",
    "appearance::message-details::avatar-size",
    "appearance::message-details::debug-grid",
    "connections",
    "connections::model-roles",
    "admin",
    "admin::users",
  ]);
  const leaf = entries.find((e) => e.id === "appearance::message-details::avatar-size");
  expect(leaf).toMatchObject({ kind: "setting", shelf: "user", groupId: "appearance", subId: "message-details", settingId: "avatar-size" });
});

test("a `when`-hidden group contributes NOTHING — search sees exactly what the LIST shows (D120)", () => {
  const entries = build((id) => id !== "admin");
  expect(entries.some((e) => e.groupId === "admin")).toBe(false);
});

test("a navLabel section matches by BOTH its heading and the abbreviation, and READS as the heading", () => {
  const section = build().find((e) => e.id === "appearance::message-details");
  expect(section?.label).toBe("Message details & actions");
  expect(section?.keywords).toContain("Chips");
  expect(section?.keywords).toContain("Message details & actions");
  expect(section?.keywords).toContain("metadata");
  expect(section?.keywords).toContain("Appearance");
});

test("@shelf: and @in: narrow by address; an unknown value matches nothing (the honest zero)", () => {
  const entries = build();
  expect(filterConfigEntries(entries, { ...NO_FILTER, shelf: "app" }, NO_MODIFIED).every((e) => e.shelf === "app")).toBe(true);
  expect(filterConfigEntries(entries, { ...NO_FILTER, group: "APPEARANCE" }, NO_MODIFIED).every((e) => e.groupId === "appearance")).toBe(true);
  expect(filterConfigEntries(entries, { ...NO_FILTER, shelf: "you" }, NO_MODIFIED)).toEqual([]);
});

test("@advanced FLIPS the axis: advanced leaves are hidden by default and are the ONLY rows when asked", () => {
  const entries = build();
  const plain = filterConfigEntries(entries, NO_FILTER, NO_MODIFIED);
  expect(plain.some((e) => e.settingId === "debug-grid")).toBe(false);
  const advanced = filterConfigEntries(entries, { ...NO_FILTER, advanced: true }, NO_MODIFIED);
  expect(advanced.map((e) => e.settingId)).toEqual(["debug-grid"]);
});

test("@modified reads the verdict at the entry's OWN grain — a leaf answers for itself, never for its section", () => {
  const entries = build();
  // The planted verdict: appearance/message-details differs from default, and `avatar-size` is the leaf that
  // differs. `debug-grid` rides the SAME section and is untouched — before #1099 F16 the section grain
  // answered for it too, which is how one changed setting returned five rows with three unmodified.
  const modified: ConfigModifiedMap = {
    subs: new Map([["appearance", new Set(["message-details"])]]),
    settings: new Set(["appearance::message-details::avatar-size"]),
  };
  const hits = filterConfigEntries(entries, { ...NO_FILTER, modified: true }, modified);
  expect(hits.map((e) => e.id)).toEqual(["appearance", "appearance::message-details", "appearance::message-details::avatar-size"]);
  // The advanced axis is orthogonal, so ask for the sibling on its own axis: it is NOT modified either way.
  const advancedHits = filterConfigEntries(entries, { ...NO_FILTER, advanced: true, modified: true }, modified);
  expect(advancedHits).toEqual([]);
  expect(filterConfigEntries(entries, { ...NO_FILTER, modified: true }, NO_MODIFIED)).toEqual([]);
});

test("a MODIFIED SECTION does not launder its untouched leaves (the F16 defect, pinned)", () => {
  const entries = build();
  // Same section, verdict present at the SECTION grain only — no leaf is claimed modified.
  const sectionOnly: ConfigModifiedMap = { subs: new Map([["appearance", new Set(["message-details"])]]), settings: new Set() };
  const hits = filterConfigEntries(entries, { ...NO_FILTER, modified: true }, sectionOnly);
  expect(hits.map((e) => e.id)).toEqual(["appearance", "appearance::message-details"]);
  expect(hits.some((e) => e.kind === "setting")).toBe(false);
});

test("isConfigEntryModified is the ONE verdict the filter applies, so a rendered mark cannot disagree with it", () => {
  const entries = build();
  const modified: ConfigModifiedMap = {
    subs: new Map([["appearance", new Set(["message-details"])]]),
    settings: new Set(["appearance::message-details::avatar-size"]),
  };
  const filtered = filterConfigEntries(entries, { ...NO_FILTER, modified: true }, modified);
  expect(filtered.every((e) => isConfigEntryModified(e, modified))).toBe(true);
  const leaf = entries.find((e) => e.id === "appearance::message-details::debug-grid");
  expect(leaf === undefined ? null : isConfigEntryModified(leaf, modified)).toBe(false);
});

test("@ext: narrows to the plugins group (the slug rides the TERMS, not this filter)", () => {
  const entries = build();
  expect(filterConfigEntries(entries, { ...NO_FILTER, ext: "weather-teller" }, NO_MODIFIED)).toEqual([]);
});
