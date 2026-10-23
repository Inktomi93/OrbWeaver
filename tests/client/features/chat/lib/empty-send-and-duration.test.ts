import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { resolveEmptySendAction } from "#client/features/chat/lib/continue-on-empty.ts";
import { durationLabel, genDurationLabel } from "#client/features/chat/lib/gen-duration.ts";

test("empty send continues assistant tails and generates only committed non-assistant tails", () => {
  const ids = createSeededIds();
  const chatId = mintTypeId(ID_PREFIX.chat, ids.next);
  const messageId = mintTypeId(ID_PREFIX.message, ids.next);
  const input = { continueOnSend: true, generateOnEmptySend: true, chatId, hasText: false, tailAssistantMessageId: messageId };

  expect(resolveEmptySendAction({ ...input, tailRole: "assistant" })).toEqual({ kind: "continue", chatId, messageId });
  expect(resolveEmptySendAction({ ...input, tailRole: "user", tailAssistantMessageId: null })).toEqual({ kind: "generate", chatId });
  expect(resolveEmptySendAction({ ...input, tailRole: "system", tailAssistantMessageId: null })).toEqual({ kind: "generate", chatId });
  expect(resolveEmptySendAction({ ...input, tailRole: null, tailAssistantMessageId: null })).toEqual({ kind: "generate", chatId });
  expect(resolveEmptySendAction({ ...input, tailRole: "assistant", continueOnSend: false })).toBeNull();
  expect(resolveEmptySendAction({ ...input, tailRole: "assistant", tailAssistantMessageId: null })).toBeNull();
  expect(resolveEmptySendAction({ ...input, tailRole: "user", generateOnEmptySend: false })).toBeNull();
  expect(resolveEmptySendAction({ ...input, tailRole: "assistant", hasText: true })).toBeNull();
  expect(resolveEmptySendAction({ ...input, tailRole: "user", hasText: true })).toBeNull();
  expect(resolveEmptySendAction({ ...input, tailRole: "assistant", chatId: null })).toBeNull();
  expect(resolveEmptySendAction({ ...input, tailRole: null, chatId: null })).toBeNull();
});

test("generation metadata suppresses incomplete or inverted windows and formats complete durations", () => {
  expect(genDurationLabel(1000, 4400)).toBe("3.4s");
  expect(genDurationLabel(0, 820)).toBe("820ms");
  expect(genDurationLabel(0, 0)).toBe("0ms");
  expect(genDurationLabel(0, 1000)).toBe("1.0s");
  expect(genDurationLabel(1000, 13_500)).toBe("12.5s");
  expect(genDurationLabel(null, 4400)).toBeNull();
  expect(genDurationLabel(1000, null)).toBeNull();
  expect(genDurationLabel(null, null)).toBeNull();
  expect(genDurationLabel(4400, 1000)).toBeNull();
  expect(durationLabel(820)).toBe("820ms");
  expect(durationLabel(0)).toBe("0ms");
  expect(durationLabel(1000)).toBe("1.0s");
  expect(durationLabel(3400)).toBe("3.4s");
});
