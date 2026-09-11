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

import type {
  DurableChatBusEvent,
  PromptTransform,
  PromptTransformEnv,
  PromptTransformOutcome,
  PromptTransformPoint,
  PromptTransformResult,
} from "@orb/contracts/chat";
import { PROMPT_TRANSFORM_ABORT_REASON_MAX } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { PromptTransformRegistry } from "../contract/context.ts";

/** The per-call deadline FLOOR each transform apply is bounded by (a LEAN — the plugin bridge is async by
 *  nature). A transform that outruns it is SKIPPED (the draft passes through unchanged). Now the born-in-DB
 *  admin floor (AppSettings.promptTransformDeadlineMs); compose injects a live getter, this is the fallback. */
export const PROMPT_TRANSFORM_DEADLINE_MS = 250;

/** One bounded apply's three outcomes — the shape that keeps "it didn't run" and "it said no" apart:
 *   `ok`      — a clean in-time render; `text` is the new draft.
 *   `skip`    — a timeout OR a throw (D53): the caller keeps the prior draft and warns.
 *   `abort`   — the transform DELIBERATELY refused the generation (§5.14); the fold stops and the turn does. */
type BoundedOutcome = { readonly kind: "ok"; readonly text: string } | { readonly kind: "skip" } | { readonly kind: "abort"; readonly reason: string };

const SKIP: BoundedOutcome = { kind: "skip" };

/** Classify a transform's raw answer. A NON-EMPTY string is the rewritten draft; a `{abort}` object is the
 *  typed refusal, its reason capped here (it is untrusted text — a guest writes it — and it reaches a refusal
 *  surface). Anything else is treated as a SKIP rather than trusted: a registrar that returns garbage has
 *  malfunctioned, and a malfunction is exactly the D53 case, never an abort.
 *
 *  AN EMPTY (or whitespace-only) ANSWER IS A SKIP, NOT A REWRITE (#1368). D53's rule is that a broken
 *  transform never eats a turn, and the emptiness cases are exactly the broken ones: an automation
 *  `transform_draft` whose template is blank, or whose macros all render to nothing, silently REPLACED the
 *  user's typed message with "" — as did a guest plugin transform returning "". A transform that produced
 *  nothing has not rewritten the draft; it has failed to render, so it takes the same road as a timeout and
 *  the same `prompt_transform_skipped` warning. Deliberately emptying a draft is not expressible here, and
 *  should not be: the arm that wants a turn stopped has `{abort}`. */
function classify(answer: PromptTransformOutcome): BoundedOutcome {
  if (typeof answer === "string") {
    return answer.trim() === "" ? SKIP : { kind: "ok", text: answer };
  }
  if (typeof answer.abort === "string") {
    return { kind: "abort", reason: answer.abort.slice(0, PROMPT_TRANSFORM_ABORT_REASON_MAX) };
  }
  return SKIP;
}

/** Run ONE transform under the deadline. The timer is always cleared so a fast render never leaves the event
 *  loop pinned. A timeout and a throw both resolve to `skip` — the deadline can never manufacture an abort. */
async function applyBounded(transform: PromptTransform, draft: string, env: PromptTransformEnv, deadlineMs: number): Promise<BoundedOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<BoundedOutcome>((resolve) => {
    timer = setTimeout(() => resolve(SKIP), deadlineMs);
  });
  // @orb-waive caught-failure-ownership(catch): D53 — a throw resolves to SKIP exactly like a
  // timeout (the type-level BoundedOutcome comment above), never manufactures an abort; the caller keeps the
  // prior draft and warns. Ends if a transform failure needs to abort the turn instead of degrading.
  try {
    return await Promise.race([transform.apply(draft, env).then(classify), deadline]);
  } catch {
    return SKIP;
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

  const apply = async (point: PromptTransformPoint, chatId: ChatId, draft: string, vars: Record<string, string>): Promise<PromptTransformResult> => {
    const ordered = [...byId.values()].filter((t) => t.point === point).sort((a, b) => a.order - b.order);
    if (ordered.length === 0) {
      return { aborted: false, text: draft };
    }
    const env: PromptTransformEnv = { chatId, vars };
    const skipped: string[] = [];
    // Fold the ordered transforms sequentially (each sees the prior's output — the ordered-step semantics 04 §6
    // pins). An async chain (not a for-await loop) so the inherently-sequential await needs no suppression;
    // depth = transform count (bounded — automation rules + a compose-static plugin set).
    //
    // AN ABORT STOPS THE FOLD, and that is the point: a later transform must never see (nor rewrite) the draft
    // of a turn an earlier one already refused, and the caller must learn WHICH transform refused. The skip
    // warnings collected before the abort are still emitted — they happened.
    const foldFrom = async (index: number, current: string): Promise<PromptTransformResult> => {
      const transform = ordered[index];
      if (transform === undefined) {
        return { aborted: false, text: current };
      }
      const result = await applyBounded(transform, current, env, deadlineMs());
      if (result.kind === "ok") {
        return foldFrom(index + 1, result.text);
      }
      if (result.kind === "abort") {
        getLog().info({ chatId, transformId: transform.id, point }, "chat: prompt transform ABORTED the generation");
        return { aborted: true, transformId: transform.id, reason: result.reason };
      }
      getLog().warn({ chatId, transformId: transform.id, point }, "chat: prompt transform SKIPPED (deadline/throw/empty render) — draft unchanged");
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
