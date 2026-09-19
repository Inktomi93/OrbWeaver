// Fixture tests for the PURE argv parsers snap's new multi-tab + SPA-nav features rely on
// (tooling/src/_shared/argv.ts): the `@<idx>` --pages tab-suffix split and the `--goto` target decode.
// The browser-driving orchestration (nav bridge eval, watch series, multi-page capture) is live-proven
// against the running stack, not here — this file's home is tests/tooling/ per core/Spine-Testing.md §2
// (a test of a scripts/ tool), same as snap-stage.test.ts.
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

test("parseGotoTarget decodes modal:<slot> to openModal", () => {
  expect(parseGotoTarget("modal:you")).toEqual({ method: "openModal", arg: "you" });
  expect(parseGotoTarget("modal:you")).toEqual({ method: "openModal", arg: "you" });
});
