// Fixture tests for the PURE argv parsers snap's new multi-tab + SPA-nav features rely on
// (scripts/probes/_kit/flags.ts): the `@<idx>` --pages tab-suffix split and the `--goto` target decode.
// The browser-driving orchestration (nav bridge eval, watch series, multi-page capture) is live-proven
// against the running stack, not here — this file's home is tests/tooling/ per core/Spine-Testing.md §2
// (a test of a scripts/ tool), same as snap-stage.test.ts.
import { parseGotoTarget, splitPageSuffix } from "../../scripts/probes/_kit/flags.ts";
import { expect, test } from "../support/fixtures.ts";

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

// ── parseGotoTarget ───────────────────────────────────────────────────────────────────────────────────

test("parseGotoTarget maps a bare id to the section method", () => {
  expect(parseGotoTarget("presets")).toEqual({ method: "section", arg: "presets" });
  expect(parseGotoTarget("chats")).toEqual({ method: "section", arg: "chats" });
});

test("parseGotoTarget decodes settings:<category> to openSettings", () => {
  expect(parseGotoTarget("settings:appearance")).toEqual({ method: "openSettings", arg: "appearance" });
  // A category that itself contains a colon keeps everything after the FIRST prefix.
  expect(parseGotoTarget("settings:chat-behavior")).toEqual({ method: "openSettings", arg: "chat-behavior" });
});

test("parseGotoTarget decodes modal:<slot> to openModal", () => {
  expect(parseGotoTarget("modal:theme")).toEqual({ method: "openModal", arg: "theme" });
  expect(parseGotoTarget("modal:settings")).toEqual({ method: "openModal", arg: "settings" });
});
