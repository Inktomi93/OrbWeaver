// substrate/prompt-transforms — the D50 PromptTransform registrar (automation-design/04 §6). Proves the
// contract the turn pipeline relies on: zero registrants is a byte-identical no-op; transforms apply in
// ascending `order` (automation < plugins) and CHAIN (each sees the prior's output); only the called point's
// transforms run; a throw OR a deadline overrun SKIPS that transform (draft unchanged) + emits ONE
// `prompt_transform_skipped` warning; register/unregister mutate the live set.

import type { ChatBusEvent, PromptTransform } from "@orb/contracts/chat";
import { PROMPT_TRANSFORM_ABORT_REASON_MAX } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPromptTransformRegistry } from "../../../../../packages/server/src/domain/chat/substrate/prompt-transforms.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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

// #1368 — a transform that renders to NOTHING used to be classified as a clean rewrite, so a blank (or
// all-macros-render-empty) `transform_draft` template REPLACED the user's typed message with "". D53's rule
// is that a broken transform never eats a turn; producing nothing is the broken case, not a rewrite.
test("a transform that returns an EMPTY answer is SKIPPED, not applied — the draft survives + one warning", async () => {
  for (const empty of ["", "   ", "\n\t"]) {
    const { emit, warnings } = recorder();
    const reg = createPromptTransformRegistry(emit);
    reg.register({ id: "blank", point: "user_input", order: 0, apply: () => Promise.resolve(empty) });
    const out = await reg.apply("user_input", CHAT, "the user's message", {});
    expect(out).toEqual({ aborted: false, text: "the user's message" });
    expect(warnings).toEqual([{ type: "warning", chatId: CHAT, code: "prompt_transform_skipped" }]);
  }
});

test("an empty answer does not break the FOLD — a later transform still sees the surviving draft", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  reg.register({ id: "blank", point: "user_input", order: 0, apply: () => Promise.resolve("") });
  reg.register(appender("after", 1, "!"));
  expect(await reg.apply("user_input", CHAT, "hello", {})).toEqual({ aborted: false, text: "hello!" });
});

test("zero registrants is a byte-identical no-op (returns the draft unchanged)", async () => {
  const { emit, warnings } = recorder();
  const reg = createPromptTransformRegistry(emit);
  const out = await reg.apply("user_input", CHAT, "hello", {});
  expect(out).toEqual({ aborted: false, text: "hello" });
  expect(warnings).toHaveLength(0);
});

test("a single transform rewrites the draft at its point", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  reg.register({ id: "a", point: "user_input", order: 0, apply: (draft) => Promise.resolve(draft.toUpperCase()) });
  expect(await reg.apply("user_input", CHAT, "hi", {})).toEqual({ aborted: false, text: "HI" });
});

test("only the called point's transforms run (an assembled_dynamic transform is inert for user_input)", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  reg.register({ id: "dyn", point: "assembled_dynamic", order: 0, apply: (draft) => Promise.resolve(`${draft}-DYN`) });
  expect(await reg.apply("user_input", CHAT, "x", {})).toEqual({ aborted: false, text: "x" });
  expect(await reg.apply("assembled_dynamic", CHAT, "x", {})).toEqual({ aborted: false, text: "x-DYN" });
});

test("transforms apply in ascending order and CHAIN — each sees the prior's output (automation < plugins)", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  // Registered out of order; the registry sorts by `order` (plugin 1000 after automation 500 after 0).
  reg.register(appender("plugin", 1000, "[P]"));
  reg.register(appender("auto-b", 500, "[B]"));
  reg.register(appender("auto-a", 0, "[A]"));
  expect(await reg.apply("user_input", CHAT, "base", {})).toEqual({ aborted: false, text: "base[A][B][P]" });
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
  expect(out).toEqual({ aborted: false, text: "s[1][3]" });
  expect(warnings).toEqual([{ type: "warning", chatId: CHAT, code: "prompt_transform_skipped" }]);
});

test("a transform that overruns its deadline is SKIPPED + warns (draft unchanged)", async () => {
  const { emit, warnings } = recorder();
  // A tiny deadline so the hang resolves fast + deterministically.
  const reg = createPromptTransformRegistry(emit, () => 20);
  reg.register({ id: "hang", point: "user_input", order: 0, apply: () => new Promise<string>(() => undefined) });
  const out = await reg.apply("user_input", CHAT, "kept", {});
  expect(out).toEqual({ aborted: false, text: "kept" });
  expect(warnings).toEqual([{ type: "warning", chatId: CHAT, code: "prompt_transform_skipped" }]);
});

test("register is idempotent by id (a re-register replaces) and unregister removes", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  reg.register(appender("r", 0, "[v1]"));
  reg.register(appender("r", 0, "[v2]")); // same id → replaces
  expect(reg.list()).toHaveLength(1);
  expect(await reg.apply("user_input", CHAT, "x", {})).toEqual({ aborted: false, text: "x[v2]" });
  reg.unregister("r");
  expect(reg.list()).toHaveLength(0);
  expect(await reg.apply("user_input", CHAT, "x", {})).toEqual({ aborted: false, text: "x" });
});

// ── The TYPED ABORT — the outcome that is NOT the D53 skip ───────────────────────
// A skip means "this transform did not run, keep the draft and keep the turn"; an abort means "this transform
// ran and says the turn must not happen". Collapsing them would make a hung transform indistinguishable from a
// deliberate refusal, which is the one confusion this shape exists to prevent.

test("a transform returning {abort} STOPS the fold and names itself — later transforms never see the draft", async () => {
  const { emit, warnings } = recorder();
  const reg = createPromptTransformRegistry(emit);
  let laterRan = false;
  reg.register(appender("before", 0, "[1]"));
  reg.register({ id: "veto", point: "user_input", order: 1, apply: () => Promise.resolve({ abort: "policy says no" }) });
  reg.register({
    id: "after",
    point: "user_input",
    order: 2,
    apply: (draft) => {
      laterRan = true;
      return Promise.resolve(draft);
    },
  });
  expect(await reg.apply("user_input", CHAT, "s", {})).toEqual({ aborted: true, transformId: "veto", reason: "policy says no" });
  expect(laterRan).toBe(false);
  // An abort is not a skip: no `prompt_transform_skipped` warning is emitted for it.
  expect(warnings).toEqual([]);
});

test("an abort REASON is capped (it is untrusted guest text reaching a refusal surface)", async () => {
  const { emit } = recorder();
  const reg = createPromptTransformRegistry(emit);
  reg.register({ id: "veto", point: "user_input", order: 0, apply: () => Promise.resolve({ abort: "z".repeat(PROMPT_TRANSFORM_ABORT_REASON_MAX + 500) }) });
  const out = await reg.apply("user_input", CHAT, "s", {});
  expect(out.aborted).toBe(true);
  expect(out.aborted ? out.reason.length : -1).toBe(PROMPT_TRANSFORM_ABORT_REASON_MAX);
});

test("a DEADLINE can never manufacture an abort — a hang is still a skip, and the turn survives", async () => {
  // The load-bearing asymmetry: if a timeout could produce an abort, a slow plugin would silently start
  // refusing turns. The deadline arm resolves to the skip sentinel and nothing else.
  const { emit, warnings } = recorder();
  const reg = createPromptTransformRegistry(emit, () => 20);
  reg.register({ id: "hang", point: "user_input", order: 0, apply: () => new Promise(() => undefined) });
  expect(await reg.apply("user_input", CHAT, "kept", {})).toEqual({ aborted: false, text: "kept" });
  expect(warnings).toEqual([{ type: "warning", chatId: CHAT, code: "prompt_transform_skipped" }]);
});

test("a MALFORMED answer (neither string nor {abort}) is a SKIP, never an abort — a broken registrar cannot veto", async () => {
  const { emit, warnings } = recorder();
  const reg = createPromptTransformRegistry(emit);
  // A guest returning `{}` has malfunctioned; a malfunction is exactly the D53 case.
  // @orb-waive no-test-fabrication(unknown): the SUBJECT is a malformed guest answer — the double-cast IS the invalid input under test, and a typed factory could not produce it. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  reg.register({ id: "junk", point: "user_input", order: 0, apply: () => Promise.resolve({} as unknown as string) });
  expect(await reg.apply("user_input", CHAT, "kept", {})).toEqual({ aborted: false, text: "kept" });
  expect(warnings).toEqual([{ type: "warning", chatId: CHAT, code: "prompt_transform_skipped" }]);
});
