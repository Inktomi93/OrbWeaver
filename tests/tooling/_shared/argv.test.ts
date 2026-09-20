// Fixture tests for the PURE argv parsers snap's new multi-tab + SPA-nav features rely on
// (tooling/src/_shared/argv.ts): the `@<idx>` --pages tab-suffix split and the `--goto` target decode.
// The browser-driving orchestration (nav bridge eval, watch series, multi-page capture) is live-proven
// against the running stack, not here — this file's home is tests/tooling/ per core/Spine-Testing.md §2
// (a test of a scripts/ tool), same as snap-stage.test.ts.
import { readFileSync } from "node:fs";
import { parseGotoTarget, parseViewport, splitPageSuffix } from "@orb/tooling/_shared/argv";
import { expect, test } from "../../support/tool-fixtures.ts";

// ── splitPageSuffix ───────────────────────────────────────────────────────────────────────────────────

test("splitPageSuffix pulls a @<idx> page suffix off a flag", () => {
  expect(splitPageSuffix("--click@1")).toEqual({ flag: "--click", page: 1 });
  expect(splitPageSuffix("--eval@0")).toEqual({ flag: "--eval", page: 0 });
  expect(splitPageSuffix("--aria@12")).toEqual({ flag: "--aria", page: 12 });
});

test("splitPageSuffix defaults to page 0 for an unprefixed flag", () => {
  expect(splitPageSuffix("--click")).toEqual({ flag: "--click", page: 0 });
  expect(splitPageSuffix("--map")).toEqual({ flag: "--map", page: 0 });
  // The nav flags share the same page-suffix parse — `--open-character`/`--open-chat` route to a tab too.
  expect(splitPageSuffix("--open-character")).toEqual({ flag: "--open-character", page: 0 });
  expect(splitPageSuffix("--open-character@2")).toEqual({ flag: "--open-character", page: 2 });
});

test("splitPageSuffix leaves a bare or non-numeric @ untouched — not every @ is a page prefix", () => {
  // A route/value containing `@` (or a `@` with no digits) must NOT be mistaken for a tab suffix.
  expect(splitPageSuffix("--fill@")).toEqual({ flag: "--fill@", page: 0 });
  expect(splitPageSuffix("--goto@abc")).toEqual({ flag: "--goto@abc", page: 0 });
  expect(splitPageSuffix("user@host")).toEqual({ flag: "user@host", page: 0 });
});

// ── parseViewport ─────────────────────────────────────────────────────────────────────────────────────

test("parseViewport parses a positive WxH", () => {
  expect(parseViewport("1920x1080")).toEqual({ width: 1920, height: 1080 });
  expect(parseViewport("375x667")).toEqual({ width: 375, height: 667 });
});

test("parseViewport rejects zero width or height", () => {
  expect(parseViewport("0x1080")).toBeNull();
  expect(parseViewport("1920x0")).toBeNull();
  expect(parseViewport("0x0")).toBeNull();
});

test("parseViewport rejects negative width or height — truthiness alone admits negatives", () => {
  expect(parseViewport("-1920x1080")).toBeNull();
  expect(parseViewport("1920x-1080")).toBeNull();
  expect(parseViewport("-1920x-1080")).toBeNull();
});

test("parseViewport rejects fractional, non-finite, and extra dimensions", () => {
  for (const raw of [
    "1280.5x800",
    "1280x800.5",
    "Infinityx800",
    "1280x800x2",
    "1280x800junk",
    "1e3x768",
    "+1024x768",
    " 1024x768",
    "1024x768 ",
    "1024 x768",
    "1024x 768",
    `${Number.MAX_SAFE_INTEGER + 1}x768`,
    `1024x${Number.MAX_SAFE_INTEGER + 1}`,
  ]) {
    expect(parseViewport(raw)).toBeNull();
  }
});

// ── parseGotoTarget ───────────────────────────────────────────────────────────────────────────────────

test("parseGotoTarget maps a bare id to the section method", () => {
  expect(parseGotoTarget("presets")).toEqual({ method: "section", arg: "presets" });
  expect(parseGotoTarget("chats")).toEqual({ method: "section", arg: "chats" });
});

test("parseGotoTarget decodes config:<group> to openConfig, and refuses an unknown namespace head", () => {
  expect(parseGotoTarget("config:appearance")).toEqual({ method: "openConfig", arg: "appearance" });
  expect(parseGotoTarget("config:appearance.sizing")).toEqual({ method: "openConfig", arg: "appearance", sub: "sizing" });
  // A category that itself contains a colon keeps everything after the FIRST prefix.
  expect(parseGotoTarget("config:chat-behavior")).toEqual({ method: "openConfig", arg: "chat-behavior" });
});

test("parseGotoTarget REFUSES an unknown `<word>:` namespace instead of decoding it as a rail section (#2447)", () => {
  // THE ARM THAT MAKES THE `settings:` → `config:` RENAME HONEST. Without it the retired spelling falls
  // through to `{ method: "section", arg: "settings:appearance" }`, the bridge is handed a section id no
  // rail carries, and the failure surfaces — if it surfaces at all — as something other than "you typed the
  // old word". No rail section id contains a colon (`packages/client/src/state/section-ids.ts`), so this is
  // the grammar failing closed on ANY unknown namespace, not an alias table for one retired spelling.
  expect(() => parseGotoTarget("settings:appearance")).toThrow('opens the unknown namespace "settings:"');
  expect(() => parseGotoTarget("settings:appearance")).toThrow("config:<group>[.<sub>[.<setting>]]");
  expect(() => parseGotoTarget("pane:you")).toThrow('opens the unknown namespace "pane:"');
  // The control in the same test: the two LIVE namespaces and a bare section id are untouched by the arm.
  expect(parseGotoTarget("config:appearance")).toEqual({ method: "openConfig", arg: "appearance" });
  expect(parseGotoTarget("modal:you")).toEqual({ method: "openModal", arg: "you" });
  expect(parseGotoTarget("chats")).toEqual({ method: "section", arg: "chats" });
});

test("parseGotoTarget decodes the THIRD part — a setting LEAF — the bridge has taken since #1176", () => {
  expect(parseGotoTarget("config:appearance.sizing.density")).toEqual({ method: "openConfig", arg: "appearance", sub: "sizing", setting: "density" });
});

test("parseGotoTarget REFUSES an address the config grammar cannot spell instead of silently truncating it", () => {
  // The grammar is `config:<group>[.<sub>[.<setting>]]` — the same three-part address `openConfigTo` and
  // the `/config?to=g.s.l` copy-link take. A fourth part named nothing and used to be dropped by
  // `split(".", 2)`, so the probe navigated somewhere ELSE and reported success (the lying-nav class).
  expect(() => parseGotoTarget("config:appearance.sizing.density.extra")).toThrow("config:<group>[.<sub>[.<setting>]]");
  expect(() => parseGotoTarget("config:appearance..density")).toThrow("empty");
});

test("parseGotoTarget REFUSES a DOTTED bare target by naming the missing namespace, not the section vocabulary (#2482)", () => {
  // THE MEASURED COST. `pnpm snap --help` promised "a dotted settings address group.sub.setting"; a lane
  // drove `--goto connections.connections.add-connection`, this parser fell through to the SECTION arm, and
  // the bridge answered `unknown section "connections.connections.add-connection" — expected one of: home,
  // chats, …`. That refusal lists the wrong vocabulary, so it reads as "that id does not exist" and the lane
  // went looking for a bug in its own address instead of learning that the form needs a `config:` head.
  const dotted = "connections.connections.add-connection";
  expect(() => parseGotoTarget(dotted)).toThrow("dotted address with no namespace");
  // The refusal NAMES THE GATE: the grammar it missed, spelled the way the caller must retype it.
  expect(() => parseGotoTarget(dotted)).toThrow("config:<group>[.<sub>[.<setting>]]");
  // The same address WITH its namespace is the live form — the arm refuses a shape, never a vocabulary.
  expect(parseGotoTarget(`config:${dotted}`)).toEqual({ method: "openConfig", arg: "connections", sub: "connections", setting: "add-connection" });
  // Controls: a bare section id and both live namespaces are untouched by the dot test.
  expect(parseGotoTarget("chats")).toEqual({ method: "section", arg: "chats" });
  expect(parseGotoTarget("modal:you")).toEqual({ method: "openModal", arg: "you" });
});

test("no rail section id contains a dot — the premise the dotted-target refusal rests on (#2482)", () => {
  // THE LENS FOR A CROSS-PACKAGE PREMISE. `parseGotoTarget` claims a dotted bare target cannot be a section;
  // the vocabulary that decides it lives in the CLIENT package, which tooling may not import. So the tuple's
  // source is read as TEXT and the ids are extracted — a section id that ever grew a dot makes this red here
  // rather than making `--goto <that id>` silently unreachable.
  const source = readFileSync(new URL("../../../packages/client/src/state/section-ids.ts", import.meta.url), "utf8");
  const tuple = /export const SECTION_IDS = \[(?<body>[^\]]*)\]/u.exec(source)?.groups?.["body"];
  expect(tuple, "SECTION_IDS tuple not found — the reader rotted, which is not the same as 'no dotted id'").toBeDefined();
  const ids = [...(tuple ?? "").matchAll(/"(?<id>[^"]+)"/gu)].map((m) => m.groups?.["id"] ?? "");
  // A planted positive control in the same invocation: the extractor really does see ids, so an empty
  // result below can never read as "nothing carries a dot".
  expect(ids).toContain("chats");
  expect(ids.filter((id) => id.includes("."))).toEqual([]);
});

test("parseGotoTarget decodes modal:<slot> to openModal", () => {
  expect(parseGotoTarget("modal:you")).toEqual({ method: "openModal", arg: "you" });
  expect(parseGotoTarget("modal:you")).toEqual({ method: "openModal", arg: "you" });
});
