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
  autoContinueRounds: 1,
  autoSwipe: { enabled: true, minLength: 120, blacklist: ["As an AI", "I cannot"], maxRetries: 1 },
  customStoppingStrings: ["###", "END"],
  tempChatTtlHours: 24,
  smoothStream: true,
  smoothStreamCps: 150,
  streamScrollMode: "pin-prompt",
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
    streamScrollMode: "pin-prompt",
  });
});

test("toChatSectionPatch restores the nest and splits the list fields back to string[] (the pane's slice only)", () => {
  // The pane edits everything EXCEPT the PD-146 knobs it doesn't surface (autoSwipe.maxRetries,
  // autoContinueRounds, tempChatTtlHours) — the section-patch deep-merge preserves those untouched, so the
  // patch is `populated` minus them (and autoSwipe minus maxRetries).
  const { autoContinueRounds: _r, tempChatTtlHours: _t, autoSwipe, ...rest } = populated;
  const { maxRetries: _m, ...autoSwipeSlice } = autoSwipe;
  expect(toChatSectionPatch(projectChatForm(populated))).toEqual({ ...rest, autoSwipe: autoSwipeSlice });
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

test("the defaults round-trip unchanged (the pane's slice; the unedited PD-146 knobs are preserved by merge)", () => {
  const { autoContinueRounds: _r, tempChatTtlHours: _t, autoSwipe, ...rest } = DEFAULT_CHAT_SETTINGS;
  const { maxRetries: _m, ...autoSwipeSlice } = autoSwipe;
  expect(toChatSectionPatch(projectChatForm(DEFAULT_CHAT_SETTINGS))).toEqual({ ...rest, autoSwipe: autoSwipeSlice });
});
