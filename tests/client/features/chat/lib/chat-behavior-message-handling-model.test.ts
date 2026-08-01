// Unit: the Chat & message handling section's FORM projection (features/chat/lib/
// chat-behavior-message-handling-model) — the autoSwipe flatten + the newline-text ↔ string[] mapping the
// section's two list fields ride on (PD-146; re-homed to chat by SET-SEAMS stage 2).

import type { ChatSettings } from "@orb/contracts/settings";
import { DEFAULT_CHAT_SETTINGS } from "@orb/contracts/settings";
import { projectMessageHandlingForm, toMessageHandlingPatch } from "../../../../../packages/client/src/features/chat/lib/chat-behavior-message-handling-model";
import { expect, test } from "../../../../support/fixtures";

const populated: ChatSettings = {
  enterSends: false,
  continueOnSend: false,
  generateOnEmptySend: false,
  autoContinue: true,
  autoContinueRounds: 3,
  autoSwipe: { enabled: true, minLength: 120, blacklist: ["As an AI", "I cannot"], maxRetries: 1 },
  customStoppingStrings: ["###", "END"],
  tempChatTtlHours: 72,
  smoothStream: true,
  smoothStreamCps: 150,
  streamScrollMode: "pin-prompt",
};

test("projectMessageHandlingForm flattens the nest and newline-joins the two list fields", () => {
  expect(projectMessageHandlingForm(populated)).toEqual({
    enterSends: false,
    continueOnSend: false,
    generateOnEmptySend: false,
    autoContinue: true,
    autoContinueRounds: 3,
    autoSwipeEnabled: true,
    autoSwipeMinLength: 120,
    autoSwipeBlacklist: "As an AI\nI cannot",
    customStoppingStrings: "###\nEND",
    tempChatTtlHours: 72,
  });
});

// S1 (SET-SEAMS §2.3) — the patch is KEY-MINIMAL: exactly this section's eight owned keys, never the `chat`
// blob. The streaming keys (smoothStream/smoothStreamCps/streamScrollMode) belong to a SIBLING section, and
// carrying them here would be the lost update §2.1 describes. The key list is re-spelled on purpose so the
// assertion can't agree with the model's own `OWNS` tuple by construction.
test("toMessageHandlingPatch writes exactly this section's owned keys — no sibling key, no unowned knob", () => {
  const patch = toMessageHandlingPatch(projectMessageHandlingForm(populated));
  expect(Object.keys(patch).sort()).toStrictEqual([
    "autoContinue",
    "autoContinueRounds",
    "autoSwipe",
    "continueOnSend",
    "customStoppingStrings",
    "enterSends",
    "generateOnEmptySend",
    "tempChatTtlHours",
  ]);
  // `autoSwipe` is claimed at the TOP-level key, and its one editor-less leaf (`maxRetries`) is omitted so
  // the server's deepMergePlain preserves the stored value.
  expect(Object.keys(patch.autoSwipe).sort()).toStrictEqual(["blacklist", "enabled", "minLength"]);
});

test("toMessageHandlingPatch restores the nest and splits the list fields back to string[]", () => {
  expect(toMessageHandlingPatch(projectMessageHandlingForm(populated))).toEqual({
    enterSends: false,
    continueOnSend: false,
    generateOnEmptySend: false,
    autoContinue: true,
    autoContinueRounds: 3,
    autoSwipe: { enabled: true, minLength: 120, blacklist: ["As an AI", "I cannot"] },
    customStoppingStrings: ["###", "END"],
    tempChatTtlHours: 72,
  });
});

test("list text: blank lines + surrounding whitespace are trimmed away", () => {
  const patch = toMessageHandlingPatch({
    ...projectMessageHandlingForm(DEFAULT_CHAT_SETTINGS),
    customStoppingStrings: "  ###  \n\n  END\n",
    autoSwipeBlacklist: "\n   \n",
  });
  expect(patch.customStoppingStrings).toEqual(["###", "END"]);
  expect(patch.autoSwipe.blacklist).toEqual([]);
});

test("the defaults round-trip unchanged (minus the keys this section does not own)", () => {
  const { smoothStream: _smooth, smoothStreamCps: _cps, streamScrollMode: _mode, autoSwipe, ...owned } = DEFAULT_CHAT_SETTINGS;
  const { maxRetries: _retries, ...autoSwipeSlice } = autoSwipe;
  expect(toMessageHandlingPatch(projectMessageHandlingForm(DEFAULT_CHAT_SETTINGS))).toEqual({ ...owned, autoSwipe: autoSwipeSlice });
});
