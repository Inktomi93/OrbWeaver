// What the authed door's chrome assembly derives from the shipped sections, modals and widgets: a rail entry per
// section on its declared zone and curation, a chrome entry per modal trigger whose placement is chrome, none for
// the placements that are not, the widgets untouched, and one total (order, id) order.
// @subject packages/client/src/state/assemble-chrome.ts

import type { ModalDefinition } from "@orb/client/state";
import { assembleChrome, mobileBarCuration, SECTION_IDS } from "@orb/client/state";
import { createAuthedComposition, createClientRuntime } from "@orb/testkit/browser";
import { expect, test } from "@orb/testkit/node";
import { chromeWidgets } from "#client/compose/contributors.ts";

type Placement = ModalDefinition["trigger"]["placement"];

// An exhaustive record: a new placement fails `tsc` until it is judged chrome or not.
const SURFACES_AS_CHROME: Readonly<Record<Placement, boolean>> = {
  "rail.end": true,
  "topbar.trail": true,
  surface: false,
  "mobile-tab": false,
};

const composition = createAuthedComposition(createClientRuntime("http://localhost"));
const chrome = composition.chrome.list();
const sections = composition.sections.list();
const modals = composition.modals.list();
const entryOf = (id: string): (typeof chrome)[number] | undefined => chrome.find((entry) => entry.id === id);

test("every section is a rail entry in its declared zone, in section order, carrying its group, curation and glyph", () => {
  expect(sections).toHaveLength(SECTION_IDS.length);
  for (const [index, section] of sections.entries()) {
    expect(entryOf(section.id), section.id).toMatchObject({
      label: section.rail.label,
      group: section.rail.group,
      order: index,
      mobile: section.rail.mobile,
      behavior: { kind: "section", sectionId: section.id, icon: section.rail.icon },
    });
  }
  const declared = sections.filter((section) => section.rail.zone !== undefined);
  for (const section of declared) {
    expect(entryOf(section.id)?.zone, section.id).toBe(section.rail.zone);
  }
  // Sections that name no zone all fall to the one default, and a declared zone is a different place.
  const defaults = new Set(sections.filter((section) => section.rail.zone === undefined).map((section) => entryOf(section.id)?.zone));
  expect(defaults.size).toBe(1);
  expect(declared.length).toBeGreaterThan(0);
  expect(declared.some((section) => defaults.has(section.rail.zone))).toBe(false);
});

test("a modal trigger on a chrome placement becomes a chrome entry on that zone with its own label, glyph and order", () => {
  const triggers = modals.map((modal, index) => ({ modal, index })).filter(({ modal }) => SURFACES_AS_CHROME[modal.trigger.placement]);
  expect(triggers.length).toBeGreaterThan(0);
  for (const { modal, index } of triggers) {
    expect(entryOf(modal.id), modal.id).toMatchObject({
      label: modal.trigger.label,
      zone: modal.trigger.placement,
      order: modal.trigger.order ?? index,
      behavior: { kind: "modal", modalId: modal.id, icon: modal.trigger.icon },
    });
  }
  const curation = mobileBarCuration(chrome, SECTION_IDS[0]);
  for (const { modal } of triggers.filter(({ modal: m }) => m.trigger.mobile !== undefined)) {
    expect(entryOf(modal.id)?.mobile, modal.id).toBe(modal.trigger.mobile);
  }
  // A rail action carries its resolved phone fate on the entry itself.
  for (const { modal } of triggers.filter(({ modal: m }) => m.trigger.placement === "rail.end")) {
    expect(entryOf(modal.id)?.mobile, modal.id).toBe(curation.get(modal.id));
  }
});

test("a modal on a placement that is not chrome becomes no entry, and a chrome one beside it does", () => {
  const unmapped = modals.filter((modal) => !SURFACES_AS_CHROME[modal.trigger.placement]);
  expect(unmapped.length).toBeGreaterThan(0);
  expect(modals.length).toBeGreaterThan(unmapped.length);
  for (const modal of unmapped) {
    expect(entryOf(modal.id), modal.id).toBeUndefined();
  }
});

test("the shipped widgets pass through by identity, and the whole list is one total order by (order, id)", () => {
  for (const widget of chromeWidgets) {
    expect(chrome).toContain(widget);
  }
  const pairs = chrome.slice(1).map((entry, index) => [chrome[index], entry] as const);
  expect(pairs.length).toBeGreaterThan(0);
  for (const [before, after] of pairs) {
    const byOrder = (before?.order ?? 0) - (after.order ?? 0);
    expect(byOrder === 0 ? (before?.id ?? "").localeCompare(after.id) : byOrder, `${before?.id} before ${after.id}`).toBeLessThan(0);
  }
});

test("the order does not depend on the order the widgets arrive in", () => {
  const reversed = assembleChrome({ sections, modals, widgets: chromeWidgets.toReversed() });
  expect(reversed.map((entry) => entry.id)).toEqual(chrome.map((entry) => entry.id));
});
