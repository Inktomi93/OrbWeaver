// domain/chat/substrate/prompt-transforms — the D50 PromptTransform registrar (automation-design/04 §6). The
// ONE synchronous hook onto the turn pipeline: an ordered, bounded transform over a turn's DRAFT text,
// applied at exactly two fixed points (`user_input` in SEND, `assembled_dynamic` at end of BUILD). Automation's
// `transform_draft` rules register/deregister here as they enable/disable; the plugin host registers a
// compose-static set. Chat owns the ORDERING (ascending `order` — automation 0–999, plugins 1000+, so host
// policy wraps guest) + the DEADLINE discipline (each apply is bounded; a timeout or throw SKIPS it, draft
// unchanged, + a `prompt_transform_skipped` warning — a broken transform never eats a turn, D53).
//
// The registry is created ONCE at the composition root; its `apply` is injected as `ChatContext.promptTransforms`
// (a chat with zero registered transforms is byte-identical to the seam being absent — the null-op precedent).

import type { DurableChatBusEvent, PromptTransform, PromptTransformEnv, PromptTransformPoint } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { PromptTransformRegistry } from "../contract/context.ts";

/** The per-call deadline FLOOR each transform apply is bounded by (a LEAN — the plugin bridge is async by
 *  nature). A transform that outruns it is SKIPPED (the draft passes through unchanged). Now the born-in-DB
 *  admin floor (AppSettings.promptTransformDeadlineMs); compose injects a live getter, this is the fallback. */
export const PROMPT_TRANSFORM_DEADLINE_MS = 250;

/** Run ONE transform under the deadline. Resolves `{ ok: true, text }` on a clean in-time render, or
 *  `{ ok: false }` on a timeout OR a throw — both SKIP (the caller keeps the prior draft). The timer is
 *  always cleared so a fast render never leaves the event loop pinned. */
async function applyBounded(
  transform: PromptTransform,
  draft: string,
  env: PromptTransformEnv,
  deadlineMs: number,
): Promise<{ readonly ok: true; readonly text: string } | { readonly ok: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ readonly ok: false }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), deadlineMs);
  });
  try {
    return await Promise.race([transform.apply(draft, env).then((text) => ({ ok: true, text }) as const), deadline]);
  } catch {
    return { ok: false };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/** Build the per-deploy PromptTransform registrar. `emit` is the chat bus (the skip warning); `deadlineMs`
 *  is a LIVE getter (read per apply so an admin retune of AppSettings.promptTransformDeadlineMs applies without
 *  a restart) — injectable so a deadline test runs fast + deterministic (defaults to the floor const). */
export function createPromptTransformRegistry(
  emit: (event: DurableChatBusEvent) => Promise<void>,
  deadlineMs: () => number = () => PROMPT_TRANSFORM_DEADLINE_MS,
): PromptTransformRegistry {
  const byId = new Map<string, PromptTransform>();

  const apply = async (point: PromptTransformPoint, chatId: ChatId, draft: string, vars: Record<string, string>): Promise<string> => {
    const ordered = [...byId.values()].filter((t) => t.point === point).sort((a, b) => a.order - b.order);
    if (ordered.length === 0) {
      return draft;
    }
    const env: PromptTransformEnv = { chatId, vars };
    const skipped: string[] = [];
    // Fold the ordered transforms sequentially (each sees the prior's output — the ordered-step semantics 04 §6
    // pins). An async chain (not a for-await loop) so the inherently-sequential await needs no suppression;
    // depth = transform count (bounded — automation rules + a compose-static plugin set).
    const foldFrom = async (index: number, current: string): Promise<string> => {
      const transform = ordered[index];
      if (transform === undefined) {
        return current;
      }
      const result = await applyBounded(transform, current, env, deadlineMs());
      if (result.ok) {
        return foldFrom(index + 1, result.text);
      }
      getLog().warn({ chatId, transformId: transform.id, point }, "chat: prompt transform SKIPPED (deadline/throw) — draft unchanged");
      skipped.push(transform.id);
      return foldFrom(index + 1, current);
    };
    const out = await foldFrom(0, draft);
    // One `prompt_transform_skipped` warning per skipped transform — off the hot fold path.
    await Promise.all(skipped.map(() => emit({ type: "warning", chatId, code: "prompt_transform_skipped" })));
    return out;
  };

  return {
    apply,
    register: (transform): void => {
      byId.set(transform.id, transform);
    },
    unregister: (id): void => {
      byId.delete(id);
    },
    list: (): readonly PromptTransform[] => [...byId.values()],
  };
}
