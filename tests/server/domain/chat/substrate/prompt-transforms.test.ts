// substrate/prompt-transforms — the D50 PromptTransform registrar (automation-design/04 §6). Proves the
// contract the turn pipeline relies on: zero registrants is a byte-identical no-op; transforms apply in
// ascending `order` (automation < plugins) and CHAIN (each sees the prior's output); only the called point's
// transforms run; a throw OR a deadline overrun SKIPS that transform (draft unchanged) + emits ONE
// `prompt_transform_skipped` warning; register/unregister mutate the live set.

import type { ChatBusEvent, PromptTransform } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPromptTransformRegistry } from "../../../../../packages/server/src/domain/chat/substrate/prompt-transforms";
import { expect, test } from "../../../../support/fixtures";

const CHAT = castId<ChatId>("chat_transforms");

/** A warning-recording emit (the bus is a no-op sink here — we only assert the skip warnings). */
function recorder(): { emit: (e: ChatBusEvent) => Promise<void>; warnings: ChatBusEvent[] } {
  const warnings: ChatBusEvent[] = [];
  return {
    warnings,
    emit: (e): Promise<void> => {
      warnings.push(e);
      return Promise.resolve();
    },
  };
}

/** A pure transform that appends a marker (proves ordering + chaining without I/O). */
function appender(id: string, order: number, marker: string): PromptTransform {
  return { id, point: "user_input", order, apply: (draft) => Promise.resolve(`${draft}${marker}`) };
}

test("zero registrants is a byte-identical no-op (returns the draft unchanged)", async () => {
  const { emit, warnings } = recorder();
  const reg = createPromptTransformRegistry(emit);
  const out = await reg.apply("user_input", CHAT, "hello", {});
  expect(out).toBe("hello");
  expect(warnings).toHaveLength(0);
});

test("a single transform rewrites the draft at its point", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  reg.register({ id: "a", point: "user_input", order: 0, apply: (draft) => Promise.resolve(draft.toUpperCase()) });
  expect(await reg.apply("user_input", CHAT, "hi", {})).toBe("HI");
});

test("only the called point's transforms run (an assembled_dynamic transform is inert for user_input)", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  reg.register({ id: "dyn", point: "assembled_dynamic", order: 0, apply: (draft) => Promise.resolve(`${draft}-DYN`) });
  expect(await reg.apply("user_input", CHAT, "x", {})).toBe("x");
  expect(await reg.apply("assembled_dynamic", CHAT, "x", {})).toBe("x-DYN");
});

test("transforms apply in ascending order and CHAIN — each sees the prior's output (automation < plugins)", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  // Registered out of order; the registry sorts by `order` (plugin 1000 after automation 500 after 0).
  reg.register(appender("plugin", 1000, "[P]"));
  reg.register(appender("auto-b", 500, "[B]"));
  reg.register(appender("auto-a", 0, "[A]"));
  expect(await reg.apply("user_input", CHAT, "base", {})).toBe("base[A][B][P]");
});

test("the transform env carries the chatId + a vars snapshot", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  let seen: { chatId: ChatId; vars: Record<string, string> } | undefined;
  reg.register({
    id: "peek",
    point: "user_input",
    order: 0,
    apply: (draft, env) => {
      seen = { chatId: env.chatId, vars: env.vars };
      return Promise.resolve(draft);
    },
  });
  await reg.apply("user_input", CHAT, "d", { mood: "happy" });
  expect(seen).toEqual({ chatId: CHAT, vars: { mood: "happy" } });
});

test("a throwing transform is SKIPPED (draft unchanged) + emits one prompt_transform_skipped warning; siblings still run", async () => {
  const { emit, warnings } = recorder();
  const reg = createPromptTransformRegistry(emit);
  reg.register(appender("ok-before", 0, "[1]"));
  reg.register({ id: "boom", point: "user_input", order: 1, apply: () => Promise.reject(new Error("nope")) });
  reg.register(appender("ok-after", 2, "[3]"));
  const out = await reg.apply("user_input", CHAT, "s", {});
  // The thrower contributed nothing; the before/after transforms both applied.
  expect(out).toBe("s[1][3]");
  expect(warnings).toEqual([{ type: "warning", chatId: CHAT, code: "prompt_transform_skipped" }]);
});

test("a transform that overruns its deadline is SKIPPED + warns (draft unchanged)", async () => {
  const { emit, warnings } = recorder();
  // A tiny deadline so the hang resolves fast + deterministically.
  const reg = createPromptTransformRegistry(emit, 20);
  reg.register({ id: "hang", point: "user_input", order: 0, apply: () => new Promise<string>(() => undefined) });
  const out = await reg.apply("user_input", CHAT, "kept", {});
  expect(out).toBe("kept");
  expect(warnings).toEqual([{ type: "warning", chatId: CHAT, code: "prompt_transform_skipped" }]);
});

test("register is idempotent by id (a re-register replaces) and unregister removes", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  reg.register(appender("r", 0, "[v1]"));
  reg.register(appender("r", 0, "[v2]")); // same id → replaces
  expect(reg.list()).toHaveLength(1);
  expect(await reg.apply("user_input", CHAT, "x", {})).toBe("x[v2]");
  reg.unregister("r");
  expect(reg.list()).toHaveLength(0);
  expect(await reg.apply("user_input", CHAT, "x", {})).toBe("x");
});
