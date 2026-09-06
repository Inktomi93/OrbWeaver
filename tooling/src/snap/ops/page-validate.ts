// snap's PAGE→NODE seam validators (#1004) — every in-page read settled at the boundary instead of cast.
//
// The primitives and the argument live in `_shared/page-validate.ts`; this file declares WHAT each of
// snap's page scripts must have returned. One file rather than a validator per ops module because three
// of the hosts (`contrast.ts` 433, `materialize-devtools.ts` 422, `appearance-invariant-runtime.ts` 434)
// sit within twenty lines of the 450-line tooling cap, and because collecting them makes the shared
// discipline visible in one place.
//
// EACH ARM NAMES THE LIE IT PREVENTS — none of these is hypothetical:
//   • contrast facts     — a union whose arms are told apart by the PRESENCE of a key (`offscreen`,
//                          `occluded`). A malformed object satisfies none of them and falls through to
//                          the measured arm, where `undefined` color/box produce a fabricated verdict.
//   • map entries        — each row is handed to a per-row selector validator that immediately reads
//                          `.selector`/`.role`/`.name`; a non-row throws deep inside that walk with no
//                          mention of the page read that produced it.
//   • dead-css census    — every number here is printed as evidence and compared against a budget.
//   • dead-css drain     — `null` is a REAL answer (a `--file` fixture has no bridge) and must stay
//                          distinguishable from "the drain returned something we could not read".
//   • perf evidence      — read inside a `catch → null` (optional-read-as-absent), so a malformed
//                          payload must throw HERE to reach that arm rather than land as fake numbers.
//   • devtools proof     — the attach proof for the whole DevTools materialisation.
//   • reset/animation    — the appearance-invariant row's own preconditions; each already has an
//                          `instrumentError` arm for a FALSE answer, and none had one for a wrong SHAPE.
import { pageArray, pageBoolean, pageCount, pageNumber, pageNumberInRange, pageObject, pageString } from "@orb/tooling/_shared/page-validate";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ContrastFacts } from "../contract/contrast.ts";
import type { DeadCssEvidence } from "../contract/dead-css.ts";
import type { MapAtlasEvidence, MapNavCapabilities, MapShellEvidence, MapShellRegion, RawMapBridgeEvidence, RawMapEntry } from "../contract/map.ts";
import {
  MAP_ACTIONABILITIES,
  MAP_INACTIVE_REASONS,
  MAP_PANEL_MODES,
  MAP_SHELL_REGIMES,
  MAP_SHELL_REGION_IDS,
  MAP_VISIBILITIES,
  mapChatPositionSchema,
  mapConfigGroupIdSchema,
  mapContextTabIdSchema,
  mapModalSlotIdSchema,
  mapSectionIdSchema,
} from "../contract/map.ts";
import type { PerfEvidence } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap");

const ASCII_CONTROL_MAX = 31;
const ASCII_DELETE = 127;

/** The `--contrast` script's raw facts. `null` (no match) is a real answer; the three non-null arms are
 *  discriminated by key presence, so the arm test happens HERE rather than by falling through. */
export function contrastFacts(value: unknown): ContrastFacts {
  if (value === null || value === undefined) {
    return null;
  }
  const label = "the contrast read";
  const record = pageObject(value, label);
  // THE RANGES, and why each is what it is (#1509). `total`/`inViewport`/`matchIndex` are populations and
  // an index into one: non-negative whole numbers. `fontSizePx`, `width`, `height` and the four radii are
  // CSS lengths: non-negative, no upper bound. `fontWeight` is the CSS `font-weight` domain, 1..1000.
  // `foregroundOpacity` is a composited alpha, 0..1 — a value outside it silently rewrote a contrast
  // verdict. `box.x`/`box.y` stay UNBOUNDED on purpose: a negative viewport coordinate is the honest
  // reading of an off-screen element, which is a whole arm of this very union.
  if (record["offscreen"] === true) {
    return { offscreen: true, total: pageCount(record["total"], `${label} field "total"`) };
  }
  if (record["occluded"] === true) {
    return {
      occluded: true,
      total: pageCount(record["total"], `${label} field "total"`),
      inViewport: pageCount(record["inViewport"], `${label} field "inViewport"`),
      occluder: nullableString(record["occluder"], `${label} field "occluder"`),
    };
  }
  const backdropRecord = pageObject(record["backdrop"], `${label} field "backdrop"`);
  const backdropKind = enumValue(backdropRecord["kind"], ["flat", "transparent", "indeterminate"] as const, `${label} backdrop "kind"`);
  const backdrop =
    backdropKind === "flat" ? { kind: backdropKind, color: pageString(backdropRecord["color"], `${label} backdrop "color"`) } : { kind: backdropKind };
  const box = pageObject(record["box"], `${label} field "box"`);
  const radii = pageObject(record["radii"], `${label} field "radii"`);
  return {
    color: pageString(record["color"], `${label} field "color"`),
    fontSizePx: pageNumberInRange(record["fontSizePx"], `${label} field "fontSizePx"`, { min: 0 }),
    fontWeight: pageNumberInRange(record["fontWeight"], `${label} field "fontWeight"`, { min: 1, max: 1000 }),
    backdrop,
    hasText: pageBoolean(record["hasText"], `${label} field "hasText"`),
    hasIconInk: pageBoolean(record["hasIconInk"], `${label} field "hasIconInk"`),
    inactive: pageBoolean(record["inactive"], `${label} field "inactive"`),
    role: pageString(record["role"], `${label} field "role"`),
    tag: pageString(record["tag"], `${label} field "tag"`),
    foregroundOpacity: pageNumberInRange(record["foregroundOpacity"], `${label} field "foregroundOpacity"`, { min: 0, max: 1 }),
    box: {
      x: pageNumber(box["x"], `${label} box "x"`),
      y: pageNumber(box["y"], `${label} box "y"`),
      width: pageNumberInRange(box["width"], `${label} box "width"`, { min: 0 }),
      height: pageNumberInRange(box["height"], `${label} box "height"`, { min: 0 }),
    },
    radii: {
      tl: pageNumberInRange(radii["tl"], `${label} radii "tl"`, { min: 0 }),
      tr: pageNumberInRange(radii["tr"], `${label} radii "tr"`, { min: 0 }),
      br: pageNumberInRange(radii["br"], `${label} radii "br"`, { min: 0 }),
      bl: pageNumberInRange(radii["bl"], `${label} radii "bl"`, { min: 0 }),
    },
    matchIndex: pageCount(record["matchIndex"], `${label} field "matchIndex"`),
    total: pageCount(record["total"], `${label} field "total"`),
  };
}

/** `--map`'s raw rows. `null` means "no element matches", which the caller renders as its own message. */
export function rawMapEntries(value: unknown): RawMapEntry[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  const label = "the map read";
  const rows = pageArray(value, label);
  return rows.map((row, index): RawMapEntry => {
    const record = pageObject(row, `${label} row ${String(index)}`);
    const state = pageObject(record["state"], `${label} row ${String(index)} field "state"`);
    const checked = state["checked"];
    if (!(checked === null || typeof checked === "boolean" || checked === "mixed")) {
      throw new Error(`INSTRUMENT ERROR: ${label} row ${String(index)} state "checked" is not boolean, mixed, or null`);
    }
    return {
      role: pageString(record["role"], `${label} row ${String(index)} field "role"`),
      name: pageString(record["name"], `${label} row ${String(index)} field "name"`),
      selector: pageString(record["selector"], `${label} row ${String(index)} field "selector"`),
      fallback: pageString(record["fallback"], `${label} row ${String(index)} field "fallback"`),
      semanticFallback: pageString(record["semanticFallback"], `${label} row ${String(index)} field "semanticFallback"`),
      state: {
        disabled: nullableBoolean(state["disabled"], `${label} row ${String(index)} state "disabled"`),
        current: nullableString(state["current"], `${label} row ${String(index)} state "current"`),
        checked,
        expanded: nullableBoolean(state["expanded"], `${label} row ${String(index)} state "expanded"`),
      },
      visibility: enumValue(record["visibility"], MAP_VISIBILITIES, `${label} row ${String(index)} field "visibility"`),
      inactiveReason: nullableEnum(record["inactiveReason"], MAP_INACTIVE_REASONS, `${label} row ${String(index)} field "inactiveReason"`),
      actionability: enumValue(record["actionability"], MAP_ACTIONABILITIES, `${label} row ${String(index)} field "actionability"`),
    };
  });
}

function nullableBoolean(value: unknown, label: string): boolean | null {
  return value === null ? null : pageBoolean(value, label);
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : pageString(value, label);
}

function enumValue<const T extends readonly string[]>(value: unknown, options: T, label: string): T[number] {
  const text = pageString(value, label);
  const match = options.find((candidate) => candidate === text);
  if (match === undefined) {
    throw new Error(`INSTRUMENT ERROR: ${label} returned ${JSON.stringify(text)}, expected ${options.join("|")}`);
  }
  return match;
}

function nullableEnum<const T extends readonly string[]>(value: unknown, options: T, label: string): T[number] | null {
  return value === null ? null : enumValue(value, options, label);
}

function safeString(value: unknown, label: string): string {
  const text = pageString(value, label);
  const hasControl = [...text].some((character) => {
    const code = character.charCodeAt(0);
    return code <= ASCII_CONTROL_MAX || code === ASCII_DELETE;
  });
  if (text.trim() === "" || hasControl) {
    throw new Error(`INSTRUMENT ERROR: ${label} must be a non-empty single-line string`);
  }
  return text;
}

function shellRect(value: unknown, label: string): MapShellRegion["rect"] {
  const row = pageObject(value, `${label} field "rect"`);
  return {
    x: pageNumber(row["x"], `${label} rect "x"`),
    y: pageNumber(row["y"], `${label} rect "y"`),
    width: pageNumber(row["width"], `${label} rect "width"`),
    height: pageNumber(row["height"], `${label} rect "height"`),
  };
}

function identityList<T extends string>(value: unknown, label: string, parse: (value: string) => T): readonly T[] {
  const rows = pageArray(value, label).map((entry, index) => parse(safeString(entry, `${label} row ${String(index)}`)));
  if (new Set(rows).size !== rows.length) {
    throw new Error(`INSTRUMENT ERROR: ${label} contains duplicate members`);
  }
  return rows;
}

function navCapabilities(value: unknown): MapNavCapabilities {
  const label = "the Orbweaver navigation capabilities bridge";
  const record = pageObject(value, label);
  const sections = identityList(record["sections"], `${label} field "sections"`, (entry) => mapSectionIdSchema.parse(entry));
  const modalSlots = identityList(record["modalSlots"], `${label} field "modalSlots"`, (entry) => mapModalSlotIdSchema.parse(entry));
  const configGroups = identityList(record["configGroups"], `${label} field "configGroups"`, (entry) => mapConfigGroupIdSchema.parse(entry));
  const contextTabs = identityList(record["contextTabs"], `${label} field "contextTabs"`, (entry) => mapContextTabIdSchema.parse(entry));
  const chatPositions = identityList(record["chatPositions"], `${label} field "chatPositions"`, (entry) => mapChatPositionSchema.parse(entry));
  const contextTabNames = pageArray(record["contextTabNames"], `${label} field "contextTabNames"`).map((entry, index) => {
    const row = pageObject(entry, `${label} contextTabNames row ${String(index)}`);
    return {
      id: mapContextTabIdSchema.parse(safeString(row["id"], `${label} contextTabNames row ${String(index)} id`)),
      label: safeString(row["label"], `${label} contextTabNames row ${String(index)} label`),
    };
  });
  const contextTabsPublished = pageBoolean(record["contextTabsPublished"], `${label} field "contextTabsPublished"`);
  if (sections.length === 0 || chatPositions.length === 0) {
    throw new Error(`INSTRUMENT ERROR: ${label} must publish at least one section and chat position`);
  }
  if (JSON.stringify(contextTabs) !== JSON.stringify(contextTabNames.map((entry) => entry.id))) {
    throw new Error("INSTRUMENT ERROR: the Orbweaver navigation capabilities bridge contextTabs/contextTabNames ids disagree");
  }
  if (contextTabsPublished !== contextTabs.length > 0) {
    throw new Error("INSTRUMENT ERROR: the Orbweaver navigation capabilities bridge contextTabsPublished disagrees with the published tab population");
  }
  return { sections, modalSlots, configGroups, contextTabs, contextTabNames, contextTabsPublished, chatPositions };
}

export function mapAtlasEvidence(value: unknown): MapAtlasEvidence {
  const label = "the map application atlas";
  const record = pageObject(value, label);
  const status = enumValue(record["status"], ["available", "unavailable"] as const, `${label} field "status"`);
  const url = pageString(record["url"], `${label} field "url"`);
  if (status === "unavailable") {
    return { status, url, reason: safeString(record["reason"], `${label} field "reason"`) };
  }
  const placeRecord = pageObject(record["place"], `${label} field "place"`);
  return {
    status,
    url,
    capabilities: navCapabilities(record["capabilities"]),
    place: {
      url: pageString(placeRecord["url"], `${label} place "url"`),
      section: placeRecord["section"] === null ? null : mapSectionIdSchema.parse(safeString(placeRecord["section"], `${label} place "section"`)),
      chatOpen: pageBoolean(placeRecord["chatOpen"], `${label} place "chatOpen"`),
      focus: pageBoolean(placeRecord["focus"], `${label} place "focus"`),
    },
  };
}

function shellRegion(value: unknown, expectedId: string, index: number): MapShellRegion {
  const label = `the map shell region ${String(index)}`;
  const record = pageObject(value, label);
  const id = enumValue(record["id"], MAP_SHELL_REGION_IDS, `${label} field "id"`);
  if (id !== expectedId) {
    throw new Error(`INSTRUMENT ERROR: ${label} returned id ${JSON.stringify(id)}, expected ${JSON.stringify(expectedId)}`);
  }
  const rectValue = record["rect"];
  const rect = rectValue === null ? null : shellRect(rectValue, label);
  const mode = nullableEnum(record["mode"], MAP_PANEL_MODES, `${label} field "mode"`);
  const panel = id === "list" || id === "context";
  if (panel !== (mode !== null)) {
    throw new Error(`INSTRUMENT ERROR: ${label} ${panel ? "must publish" : "cannot publish"} a panel mode`);
  }
  const available = nullableBoolean(record["available"], `${label} field "available"`);
  if (panel !== (available !== null)) {
    throw new Error(`INSTRUMENT ERROR: ${label} ${panel ? "must publish" : "cannot publish"} panel availability`);
  }
  return {
    id,
    mounted: pageBoolean(record["mounted"], `${label} field "mounted"`),
    visible: pageBoolean(record["visible"], `${label} field "visible"`),
    available,
    mode,
    inert: pageBoolean(record["inert"], `${label} field "inert"`),
    rect,
    position: nullableString(record["position"], `${label} field "position"`),
    zIndex: nullableString(record["zIndex"], `${label} field "zIndex"`),
    identity: nullableString(record["identity"], `${label} field "identity"`),
  };
}

export function mapShellEvidence(value: unknown): MapShellEvidence {
  const label = "the rendered Orbweaver shell map";
  const record = pageObject(value, label);
  const status = enumValue(record["status"], ["available", "unavailable"] as const, `${label} field "status"`);
  if (status === "unavailable") {
    return { status, reason: safeString(record["reason"], `${label} field "reason"`) };
  }
  const viewport = pageObject(record["viewport"], `${label} field "viewport"`);
  const rows = pageArray(record["regions"], `${label} field "regions"`);
  if (rows.length !== MAP_SHELL_REGION_IDS.length) {
    throw new Error(`INSTRUMENT ERROR: ${label} returned ${String(rows.length)} regions, expected ${String(MAP_SHELL_REGION_IDS.length)}`);
  }
  const regions = rows.map((entry, index) => shellRegion(entry, MAP_SHELL_REGION_IDS[index] ?? "", index));
  const published = pageObject(record["published"], `${label} field "published"`);
  const publishedPanels = pageArray(published["panels"], `${label} published "panels"`).map((entry, index) => {
    const panel = pageObject(entry, `${label} published panel ${String(index)}`);
    const side = enumValue(panel["side"], ["list", "context"] as const, `${label} published panel ${String(index)} side`);
    return {
      side,
      mode: enumValue(panel["mode"], MAP_PANEL_MODES, `${label} published panel ${String(index)} mode`),
      available: pageBoolean(panel["available"], `${label} published panel ${String(index)} available`),
    };
  });
  if (publishedPanels.length !== 2 || new Set(publishedPanels.map((panel) => panel.side)).size !== 2) {
    throw new Error(`INSTRUMENT ERROR: ${label} __orb.shell must publish exactly one list and one context panel`);
  }
  for (const panel of publishedPanels) {
    const rendered = regions.find((region) => region.id === panel.side);
    if (rendered === undefined || rendered.mode !== panel.mode || rendered.available !== panel.available) {
      throw new Error(`INSTRUMENT ERROR: ${label} __orb.shell panel declaration disagrees with rendered ${String(panel.side)} attributes`);
    }
  }
  const focus = pageBoolean(published["focus"], `${label} published "focus"`);
  if (focus !== pageBoolean(record["focus"], `${label} field "focus"`)) {
    throw new Error(`INSTRUMENT ERROR: ${label} __orb.shell focus disagrees with .shell-grid data-focus-mode`);
  }
  return {
    status,
    regime: enumValue(record["regime"], MAP_SHELL_REGIMES, `${label} field "regime"`),
    viewport: {
      width: pageNumber(viewport["width"], `${label} viewport "width"`),
      height: pageNumber(viewport["height"], `${label} viewport "height"`),
      devicePixelRatio: pageNumber(viewport["devicePixelRatio"], `${label} viewport "devicePixelRatio"`),
    },
    section: mapSectionIdSchema.parse(safeString(record["section"], `${label} field "section"`)),
    sectionLabel: nullableString(published["section"], `${label} published "section"`),
    publishedPanels,
    contentIdentity: nullableString(record["contentIdentity"], `${label} field "contentIdentity"`),
    chatOpen: pageBoolean(published["chatOpen"], `${label} published "chatOpen"`),
    focus,
    activeContextTab:
      record["activeContextTab"] === null ? null : mapContextTabIdSchema.parse(safeString(record["activeContextTab"], `${label} field "activeContextTab"`)),
    contextRelation: enumValue(record["contextRelation"], ["unspecified/auxiliary"] as const, `${label} field "contextRelation"`),
    regions,
  };
}

export function mapBridgePayload(value: unknown): RawMapBridgeEvidence {
  const record = pageObject(value, "the map bridge read");
  return { atlas: record["atlas"], shell: record["shell"] };
}

export function deadCssDrain(value: unknown): DeadCssEvidence["drain"] {
  if (value === null || value === undefined) {
    return null;
  }
  const label = "the motion-flagger drain receipt";
  const record = pageObject(value, label);
  // Monotonic generation counters: whole and non-negative, never a fraction or a rewind below zero.
  return {
    requestedGeneration: pageCount(record["requestedGeneration"], `${label} field "requestedGeneration"`),
    completedGeneration: pageCount(record["completedGeneration"], `${label} field "completedGeneration"`),
  };
}

export function deadCssCensus(value: unknown): Omit<DeadCssEvidence, "drain"> {
  const label = "the dead-css census";
  const record = pageObject(value, label);
  const unreadable = pageArray(record["unreadable"], `${label} field "unreadable"`).map((entry, index) => {
    const row = pageObject(entry, `${label} unreadable row ${String(index)}`);
    return {
      href: nullableString(row["href"], `${label} unreadable row ${String(index)} href`),
      error: pageString(row["error"], `${label} unreadable row ${String(index)} error`),
    };
  });
  const dead = pageArray(record["dead"], `${label} field "dead"`).map((entry, index) => {
    const row = pageObject(entry, `${label} dead row ${String(index)}`);
    return {
      token: pageString(row["token"], `${label} dead row ${String(index)} token`),
      count: pageCount(row["count"], `${label} dead row ${String(index)} count`),
    };
  });
  const empty = pageArray(record["empty"], `${label} field "empty"`).map((entry, index) => pageString(entry, `${label} empty row ${String(index)}`));
  // Every number here is a POPULATION printed as evidence and compared against a budget — a negative or
  // fractional one is a broken census, not a small one.
  return {
    sheets: pageCount(record["sheets"], `${label} field "sheets"`),
    readableSheets: pageCount(record["readableSheets"], `${label} field "readableSheets"`),
    rules: pageCount(record["rules"], `${label} field "rules"`),
    defined: pageCount(record["defined"], `${label} field "defined"`),
    used: pageCount(record["used"], `${label} field "used"`),
    unreadable,
    dead,
    empty,
  };
}

export function perfEvidence(value: unknown): Pick<PerfEvidence, "navigation" | "orb"> {
  const label = "the perf evidence read";
  const record = pageObject(value, label);
  const rawNavigation = record["navigation"];
  const navigationRecord = rawNavigation === null || rawNavigation === undefined ? null : pageObject(rawNavigation, `${label} field "navigation"`);
  const navigation =
    navigationRecord === null
      ? null
      : {
          domContentLoadedMs: pageNumber(navigationRecord["domContentLoadedMs"], `${label}.navigation "domContentLoadedMs"`),
          loadMs: pageNumber(navigationRecord["loadMs"], `${label}.navigation "loadMs"`),
          responseMs: pageNumber(navigationRecord["responseMs"], `${label}.navigation "responseMs"`),
        };
  return {
    navigation,
    orb: record["orb"],
  };
}

export interface DevToolsDiscoveryProof {
  readonly inspectedUrl: string;
  readonly fixture: boolean;
  readonly rows: readonly unknown[];
}

export function devToolsDiscoveryProof(value: unknown): DevToolsDiscoveryProof {
  const label = "the DevTools discovery bridge";
  const record = pageObject(value, label);
  return {
    inspectedUrl: pageString(record["inspectedUrl"], `${label} field "inspectedUrl"`),
    fixture: pageBoolean(record["fixture"], `${label} field "fixture"`),
    rows: pageArray(record["rows"], `${label} field "rows"`),
  };
}

/** The appearance row's checkpoint reset. `false` is a real answer the caller already turns into an
 *  INSTRUMENT ERROR; a non-boolean is a different failure and must not read as truthy. */
export function checkpointReset(value: unknown): boolean {
  return pageBoolean(value, "the checkpoint-evidence reset");
}

/** The measured-evidence reset returns the list of ring failures — empty means every ring reset. */
export function resetFailures(value: unknown): readonly string[] {
  const label = "the measured-evidence reset";
  return pageArray(value, label).map((row, index) => pageString(row, `${label} row ${String(index)}`));
}

export interface AnimationEvidence {
  readonly total: number;
  readonly dirty: number;
  readonly properties: readonly string[];
}

/** `null` is a real answer (no `__orb.animations`), which the caller turns into an INSTRUMENT ERROR. */
export function animationEvidence(value: unknown): AnimationEvidence | null {
  if (value === null || value === undefined) {
    return null;
  }
  const label = "the active-animation evidence read";
  const record = pageObject(value, label);
  const properties = pageArray(record["properties"], `${label} field "properties"`).map((entry, index) =>
    pageString(entry, `${label} property ${String(index)}`),
  );
  return {
    total: pageNumber(record["total"], `${label} field "total"`),
    dirty: pageNumber(record["dirty"], `${label} field "dirty"`),
    properties,
  };
}
