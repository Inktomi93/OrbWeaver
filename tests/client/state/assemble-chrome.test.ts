// assembleChrome (state/assemble-chrome.ts) — the PURE door assembly. Pins the three-source derivation
// (rail sections → rail.nav · mapped modal triggers → rail.end · widgets pass through), the placement→zone
// map (only rail.end maps; topbar.trail/surface/mobile-tab do NOT), the dupe-id and
// zone-validation throws, and the canonical `(order, id)` per-zone order.

import type { ChromeEntry, ChromeZone, ModalDefinition, SectionDefinition } from "@orb/client/state";
import { assembleChrome } from "@orb/client/state";
import { Command } from "@orb/ui/icons";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

function section(id: SectionDefinition["id"], mobile: SectionDefinition["rail"]["mobile"]): SectionDefinition {
  return {
    id,
    rail: { label: id, icon: Command, group: "primary", mobile },
    panelDefaults: { list: "docked", context: "collapsed" },
    placeholder: { title: id, description: id },
    content: { planned: "test" },
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

  test("maps a rail.end modal to a rail.end modal entry", () => {
    const entries = assembleChrome({ sections: [], modals: [modal("settings", "rail.end")], widgets: [] });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "settings", zone: "rail.end", behavior: { kind: "modal", modalId: "settings" } });
  });

  test("produces NO chrome entry for unmapped placements (topbar.trail/surface/mobile-tab)", () => {
    const entries = assembleChrome({
      sections: [],
      // `surface` repeats (new-chat + account, §E-7) — an unmapped placement, so still zero chrome entries.
      modals: [modal("command", "topbar.trail"), modal("account", "surface"), modal("newChat", "surface"), modal("you", "mobile-tab")],
      widgets: [],
    });
    expect(entries).toHaveLength(0);
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
