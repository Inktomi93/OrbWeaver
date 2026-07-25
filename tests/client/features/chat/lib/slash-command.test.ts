// The slash-command GRAMMAR (packages/client/src/features/chat/lib/slash-command.ts). The classification
// decides whether a draft is posted or executed, so the edge cases here are the ones that would either
// swallow a user's message or fire a command they did not ask for.

import type { SlashCommandContribution } from "@orb/client/lib";
import {
  matchSlashCommands,
  parseSlashDraft,
  slashCompletionToken,
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
