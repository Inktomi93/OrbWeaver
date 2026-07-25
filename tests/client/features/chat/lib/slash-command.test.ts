// The slash-command GRAMMAR (packages/client/src/features/chat/lib/slash-command.ts). The classification
// decides whether a draft is posted or executed, so the edge cases here are the ones that would either
// swallow a user's message or fire a command they did not ask for.

import type { SlashCommandContribution } from "@orb/client/lib";
import {
  classifySlashKey,
  matchSlashCommands,
  nextSlashHighlight,
  parseSlashDraft,
  resolveSlashHighlight,
  SLASH_LISTBOX_ID,
  slashComboboxAria,
  slashCompletionToken,
  slashOptionId,
  unknownCommandNotice,
} from "../../../../../packages/client/src/features/chat/lib/slash-command";
import { expect, test } from "../../../../support/fixtures";

function command(id: string): SlashCommandContribution {
  return { id, label: id, describe: id, mount: () => null };
}

const COMMANDS: readonly SlashCommandContribution[] = [command("roll"), command("roll-again"), command("new-chat")];

test("parseSlashDraft: splits a command into its token and the raw remainder", () => {
  expect(parseSlashDraft("/roll 2d6+1")).toEqual({ kind: "command", command: "roll", args: "2d6+1" });
});

test("parseSlashDraft: treats a bare token as a command with no args", () => {
  expect(parseSlashDraft("/new-chat")).toEqual({ kind: "command", command: "new-chat", args: "" });
});

test("parseSlashDraft: lowercases the token so registry ids stay the single spelling", () => {
  expect(parseSlashDraft("/RoLl 1d20")).toEqual({ kind: "command", command: "roll", args: "1d20" });
});

test("parseSlashDraft: keeps a multi-line remainder intact", () => {
  expect(parseSlashDraft("/roll a\nb")).toEqual({ kind: "command", command: "roll", args: "a\nb" });
});

test("parseSlashDraft: eats ONE slash for the escape, so a message starting with a slash is sendable", () => {
  expect(parseSlashDraft("//tmp is full")).toEqual({ kind: "message", text: "/tmp is full" });
});

test("parseSlashDraft: does not treat a bare slash as a command (it is the completion trigger)", () => {
  expect(parseSlashDraft("/")).toEqual({ kind: "message", text: "/" });
});

test("parseSlashDraft: does not treat a digit-led or symbol-led token as a command", () => {
  expect(parseSlashDraft("/2d6")).toEqual({ kind: "message", text: "/2d6" });
  expect(parseSlashDraft("/!bang")).toEqual({ kind: "message", text: "/!bang" });
});

test("parseSlashDraft: only classifies a LEADING slash — a mid-message slash is ordinary text", () => {
  expect(parseSlashDraft("roll /roll")).toEqual({ kind: "message", text: "roll /roll" });
  expect(parseSlashDraft(" /roll")).toEqual({ kind: "message", text: " /roll" });
});

test("parseSlashDraft: leaves an ordinary message untouched", () => {
  expect(parseSlashDraft("Hello there")).toEqual({ kind: "message", text: "Hello there" });
});

test("slashCompletionToken: is the empty string for a bare slash (offer everything)", () => {
  expect(slashCompletionToken("/")).toBe("");
});

test("slashCompletionToken: is the partial token while it is still being typed", () => {
  expect(slashCompletionToken("/ro")).toBe("ro");
});

test("slashCompletionToken: stops once the draft has whitespace — the user has moved on to arguments", () => {
  expect(slashCompletionToken("/roll ")).toBeNull();
  expect(slashCompletionToken("/roll 2d6")).toBeNull();
});

test("slashCompletionToken: is null for the escape and for ordinary text", () => {
  expect(slashCompletionToken("//tmp")).toBeNull();
  expect(slashCompletionToken("Hello")).toBeNull();
});

test("matchSlashCommands: offers every command for a bare slash, in registry order", () => {
  expect(matchSlashCommands(COMMANDS, "/").map((c) => c.id)).toEqual(["roll", "roll-again", "new-chat"]);
});

test("matchSlashCommands: offers only the prefix matches, including the exact one", () => {
  expect(matchSlashCommands(COMMANDS, "/roll").map((c) => c.id)).toEqual(["roll", "roll-again"]);
});

test("matchSlashCommands: offers nothing once the draft is no longer a command-in-progress", () => {
  expect(matchSlashCommands(COMMANDS, "/roll 2d6")).toEqual([]);
  expect(matchSlashCommands(COMMANDS, "Hello")).toEqual([]);
});

test("unknownCommandNotice: names both escape hatches, so a refused send is never a dead end", () => {
  const notice = unknownCommandNotice("nope");
  expect(notice).toContain("/nope");
  expect(notice).toContain("//nope");
});

// ── the completion strip's combobox helpers (P2 a11y keyboard nav) ─────────────────────────────────────

test("nextSlashHighlight: ArrowDown from the passive state (-1) lands on the first offer; ArrowUp lands on the last", () => {
  expect(nextSlashHighlight(-1, 1, 3)).toBe(0);
  expect(nextSlashHighlight(-1, -1, 3)).toBe(2);
});

test("nextSlashHighlight: cycles and wraps at both ends", () => {
  expect(nextSlashHighlight(0, 1, 3)).toBe(1);
  expect(nextSlashHighlight(2, 1, 3)).toBe(0);
  expect(nextSlashHighlight(0, -1, 3)).toBe(2);
});

test("nextSlashHighlight: is -1 (no highlight possible) when there are no offers", () => {
  expect(nextSlashHighlight(-1, 1, 0)).toBe(-1);
  expect(nextSlashHighlight(0, -1, 0)).toBe(-1);
});

test("classifySlashKey: Tab completes the first offer; arrows cycle the highlight", () => {
  expect(classifySlashKey({ key: "Tab", shiftKey: false, isComposing: false }, false)).toEqual({ kind: "complete-first" });
  expect(classifySlashKey({ key: "ArrowDown", shiftKey: false, isComposing: false }, false)).toEqual({ kind: "cycle", step: 1 });
  expect(classifySlashKey({ key: "ArrowUp", shiftKey: false, isComposing: false }, true)).toEqual({ kind: "cycle", step: -1 });
});

test("classifySlashKey: Enter picks ONLY when a row is highlighted — a bare Enter falls through to the send path", () => {
  expect(classifySlashKey({ key: "Enter", shiftKey: false, isComposing: false }, true)).toEqual({ kind: "pick" });
  expect(classifySlashKey({ key: "Enter", shiftKey: false, isComposing: false }, false)).toEqual({ kind: "none" });
});

test("classifySlashKey: Shift+Enter (newline) and an IME-composing Enter never pick", () => {
  expect(classifySlashKey({ key: "Enter", shiftKey: true, isComposing: false }, true)).toEqual({ kind: "none" });
  expect(classifySlashKey({ key: "Enter", shiftKey: false, isComposing: true }, true)).toEqual({ kind: "none" });
});

test("classifySlashKey: an ordinary character is none (the strip never swallows typing)", () => {
  expect(classifySlashKey({ key: "a", shiftKey: false, isComposing: false }, true)).toEqual({ kind: "none" });
});

test("resolveSlashHighlight: yields the highlighted command and its option id; -1 yields neither", () => {
  expect(resolveSlashHighlight(COMMANDS, 1)).toEqual({ command: COMMANDS[1], activeOptionId: slashOptionId("roll-again") });
  expect(resolveSlashHighlight(COMMANDS, -1)).toEqual({ command: undefined, activeOptionId: undefined });
});

test("slashComboboxAria: advertises the listbox only while open (no dangling aria-controls when closed)", () => {
  expect(slashComboboxAria(true)).toEqual({ "aria-expanded": true, "aria-controls": SLASH_LISTBOX_ID });
  expect(slashComboboxAria(false)).toEqual({ "aria-expanded": false, "aria-controls": undefined });
});
