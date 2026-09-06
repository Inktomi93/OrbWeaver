// assembleChrome (state/assemble-chrome.ts) — the PURE door assembly. Pins the three-source derivation
// (rail sections → rail.nav · mapped modal triggers → rail.end/topbar.trail · widgets pass through), the
// placement→zone map (`rail.end` + `topbar.trail` map, #1789; `surface`/`mobile-tab` do NOT), the dupe-id
// and zone-validation throws, and the canonical `(order, id)` per-zone order.

import type { ChromeEntry, ChromeZone, ModalDefinition, SectionDefinition } from "@orb/client/state";
import { assembleChrome, NO_SELECTION_TITLE } from "@orb/client/state";
import { Command } from "@orb/ui/icons";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

function section(id: SectionDefinition["id"], mobile: SectionDefinition["rail"]["mobile"]): SectionDefinition {
  return {
    id,
    rail: { label: id, icon: Command, group: "primary", mobile },
    panelDefaults: { list: "docked", context: "collapsed" },
    placeholder: { title: id, description: id },
    content: { planned: "test" },
    // Every section answers "what do I call the current screen?" — nothing to name here (see
    // `NO_SELECTION_TITLE`), which is what keeps the shell's call unconditional.
    useSelectionTitle: NO_SELECTION_TITLE,
    context: { kind: "none" },
  };
}

function modal(id: ModalDefinition["id"], placement: ModalDefinition["trigger"]["placement"]): ModalDefinition {
  return {
    id,
    title: id,
    trigger: { placement, label: id, icon: Command },
    body: { planned: "test" },
  };
}

function widget(id: string, zone: ChromeZone, order?: number): ChromeEntry {
  return { id, label: id, zone, ...(order === undefined ? {} : { order }), behavior: { kind: "widget", body: () => null } };
}

describe("assembleChrome", () => {
  test("derives a rail.nav entry per section, carrying its explicit mobile curation", () => {
    const entries = assembleChrome({ sections: [section("chats", "tab"), section("presets", "sheet")], modals: [], widgets: [] });
    const chats = entries.find((e) => e.id === "chats");
    const presets = entries.find((e) => e.id === "presets");
    expect(chats).toMatchObject({ zone: "rail.nav", mobile: "tab", behavior: { kind: "section", sectionId: "chats" } });
    expect(presets).toMatchObject({ zone: "rail.nav", mobile: "sheet", behavior: { kind: "section", sectionId: "presets" } });
  });

  // #297 / #866 S1 — the Settings SECTION renders at the rail FOOT: a section may declare `rail.zone`, and the
  // derivation honours it instead of pinning every section to `rail.nav`. The rail's group-by-group nav
  // render never sees it; the `.shell-rail-actions` foot does.
  test('a section declaring `rail.zone: "rail.end"` derives to a rail.end SECTION entry (the rail-foot Settings)', () => {
    const foot: SectionDefinition = { ...section("config", "sheet"), rail: { ...section("config", "sheet").rail, zone: "rail.end" } };
    const entries = assembleChrome({ sections: [section("chats", "tab"), foot], modals: [], widgets: [] });
    expect(entries.find((e) => e.id === "chats")).toMatchObject({ zone: "rail.nav" });
    expect(entries.find((e) => e.id === "config")).toMatchObject({ zone: "rail.end", mobile: "sheet", behavior: { kind: "section", sectionId: "config" } });
  });

  test("maps a rail.end modal to a rail.end modal entry", () => {
    const entries = assembleChrome({ sections: [], modals: [modal("newChat", "rail.end")], widgets: [] });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "newChat", zone: "rail.end", behavior: { kind: "modal", modalId: "newChat" } });
  });

  // #1789 — the half of D73 the tree only half-projected: `topbar.trail` used to be DELIBERATELY unmapped
  // (the topbar rendered a bespoke ⌘K chip off its own `useModalRegistry()` lookup), so the ONE registry had
  // a lens that could not see the affordance it was supposed to own. The trigger now derives like any other.
  test("maps a topbar.trail modal to a topbar.trail modal entry (the ⌘K trigger)", () => {
    const entries = assembleChrome({ sections: [], modals: [modal("command", "topbar.trail")], widgets: [] });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "command", label: "command", zone: "topbar.trail", behavior: { kind: "modal", modalId: "command" } });
  });

  // THE NEGATIVE THAT SURVIVES (owner ruling 2026-09-06, #1789). `surface` is a modal reached from inside a
  // feature surface, and `mobile-tab` is the INTRINSIC DOOR to the mobile projection of the chrome registry
  // — a door that is an entry inside the projection it opens would be circular. Neither is chrome.
  test("produces NO chrome entry for unmapped placements (surface/mobile-tab)", () => {
    const entries = assembleChrome({
      sections: [],
      // `surface` repeats (new-chat + add-document, §E-7) — an unmapped placement, so still zero chrome entries.
      modals: [modal("addDocument", "surface"), modal("newChat", "surface"), modal("you", "mobile-tab")],
      widgets: [],
    });
    expect(entries).toHaveLength(0);
  });

  // The trail's canonical position is REGISTRY data, never a lens's JSX order: the ⌘K chip has always been
  // rendered ahead of the trail's widgets, and that fact now lives in the sort with everything else. `mobile`
  // rides along for the same reason — the chip's phone fate (shed to the You sheet, the 320px row budget) is
  // the same `MobileCuration` axis a widget declares, so one filter serves both.
  test("carries a modal trigger's declared order + mobile curation onto the entry", () => {
    const base = modal("command", "topbar.trail");
    const command: ModalDefinition = { ...base, trigger: { ...base.trigger, order: -10, mobile: "sheet" } };
    const entries = assembleChrome({ sections: [], modals: [command], widgets: [widget("bell", "topbar.trail")] });
    expect(entries.map((e) => e.id)).toEqual(["command", "bell"]);
    expect(entries[0]).toMatchObject({ order: -10, mobile: "sheet" });
  });

  test("passes widget entries through unchanged (by identity)", () => {
    const bell = widget("bell", "topbar.trail");
    const entries = assembleChrome({ sections: [], modals: [], widgets: [bell] });
    expect(entries).toEqual([bell]);
    expect(entries[0]).toBe(bell);
  });

  test("orders each zone by (order, id): undefined order sorts as 0, ties break on id", () => {
    const entries = assembleChrome({
      sections: [],
      modals: [],
      widgets: [widget("ctx", "topbar.trail", 30), widget("full", "topbar.trail", 20), widget("bell", "topbar.trail")],
    });
    expect(entries.map((e) => e.id)).toEqual(["bell", "full", "ctx"]);
  });

  test("throws on a duplicate id across sources", () => {
    expect(() => assembleChrome({ sections: [], modals: [], widgets: [widget("dup", "topbar.trail"), widget("dup", "rail.nav", 0)] })).toThrow("duplicate");
  });

  test("throws on a zone outside CHROME_ZONES", () => {
    const bad: ChromeEntry = { id: "x", label: "X", zone: "sidebar.top" as ChromeZone, behavior: { kind: "widget", body: () => null } };
    expect(() => assembleChrome({ sections: [], modals: [], widgets: [bad] })).toThrow("not one of CHROME_ZONES");
  });
});
