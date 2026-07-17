// Unit: the chat-behavior FORM projection (features/settings/lib/chat-behavior-model) — the flatten +
// the newline-text ↔ string[] mapping the pane's two list fields ride on (PD-146).

import type { ChatSettings } from "@orb/contracts/settings";
import { DEFAULT_CHAT_SETTINGS } from "@orb/contracts/settings";
import { projectChatForm, toChatSectionPatch } from "../../../../../packages/client/src/features/settings/lib/chat-behavior-model";
import { expect, test } from "../../../../support/fixtures";

const populated: ChatSettings = {
  enterSends: false,
  continueOnSend: false,
  autoContinue: true,
  autoSwipe: { enabled: true, minLength: 120, blacklist: ["As an AI", "I cannot"] },
  customStoppingStrings: ["###", "END"],
  smoothStream: true,
  smoothStreamCps: 150,
};

test("projectChatForm flattens the nest and newline-joins the two list fields", () => {
  expect(projectChatForm(populated)).toEqual({
    enterSends: false,
    continueOnSend: false,
    autoContinue: true,
    autoSwipeEnabled: true,
    autoSwipeMinLength: 120,
    autoSwipeBlacklist: "As an AI\nI cannot",
    customStoppingStrings: "###\nEND",
    smoothStream: true,
    smoothStreamCps: 150,
  });
});

test("toChatSectionPatch restores the nest and splits the list fields back to string[]", () => {
  expect(toChatSectionPatch(projectChatForm(populated))).toEqual(populated);
});

test("list text: blank lines + surrounding whitespace are trimmed away", () => {
  const patch = toChatSectionPatch({
    ...projectChatForm(DEFAULT_CHAT_SETTINGS),
    customStoppingStrings: "  ###  \n\n  END\n",
    autoSwipeBlacklist: "\n   \n",
  });
  expect(patch.customStoppingStrings).toEqual(["###", "END"]);
  expect(patch.autoSwipe.blacklist).toEqual([]);
});

test("the defaults round-trip unchanged", () => {
  expect(toChatSectionPatch(projectChatForm(DEFAULT_CHAT_SETTINGS))).toEqual(DEFAULT_CHAT_SETTINGS);
});
