// THE INLINE-`<think>` SPLIT, moved to STREAM TIME (audit F-table "Adopt"). A server that emits its
// reasoning inline in the reply text — no `reasoning` / `reasoning_content` delta field, just prose with a
// `<think>…</think>` block in it — was handled by a POST-HOC split after the turn finished
// (`chat/engine/pipeline.ts applyReceiveTransforms`, gated on `reasoningParse.autoParse` + an empty native
// reasoning channel). That split is correct and it stays, but it cannot do the one thing that matters while
// the turn is running: the bus sees the model's thinking as PROSE until the turn ends, so the reasoning
// channel is empty for the whole generation and the reply pane renders the raw tags.
//
// `ai`'s `extractReasoningMiddleware` splits AT STREAM TIME into real `reasoning-start`/`reasoning-delta`
// parts, and it solves the chunk-boundary problem ours never did (a tag arriving split across two SSE
// chunks). It is a pure `LanguageModelMiddleware` applied through `wrapLanguageModel` — both are named
// PERMITTED in §8.0, and neither pulls in `streamText`, the agent loop, the UI stream or the tool executor
// (verified against the installed dist: `index.d.ts:8828` for the middleware, `:8894` for the wrapper, and
// the implementation at `index.js:17219` is a `TransformStream` over the V4 parts and nothing else).
//
// WHEN IT APPLIES, and the two fences are both real:
//   • `features.reasoningKeys` must be ABSENT. A row that names its reasoning delta field has a NATIVE
//     channel; running the tag split over it would look for tags in text that never contains any, and on a
//     model that emits BOTH would double-count the trace.
//   • the preset's tag pair must be an XML-shaped `<X>`/`</X>`. The middleware takes a tagName and builds
//     the pair itself, so a user's `[thinking]`/`[/thinking]` is INEXPRESSIBLE here — and that is exactly
//     the case the post-hoc split still serves. Declining to map it is not a gap; mapping it wrongly would
//     silently strip nothing while claiming the channel was handled.
// The preset stays the user control either way (`reasoningParse.autoParse` gates both halves).

import type { LanguageModelMiddleware } from "ai";
import { extractReasoningMiddleware } from "ai";

/** The preset's literal open/close tags (`reasoningParse.prefix`/`suffix`), as the turn request carries them. */
export interface ReasoningTags {
  readonly prefix: string;
  readonly suffix: string;
}

const XML_OPEN_RE = /^<(?<name>[A-Za-z][\w:-]*)>$/u;

/** `<think>` + `</think>` → `think`; anything else → undefined (the post-hoc split keeps that case). */
export function tagNameOf(tags: ReasoningTags | undefined): string | undefined {
  const name = tags === undefined ? undefined : XML_OPEN_RE.exec(tags.prefix)?.groups?.["name"];
  return name !== undefined && tags?.suffix === `</${name}>` ? name : undefined;
}

/** The middleware list for one call — EMPTY unless the row has no native reasoning field AND the preset's
 *  tags are XML-shaped. Empty ⇒ the caller must not wrap at all (a `wrapLanguageModel` with no middleware is
 *  a pointless extra layer over every turn on every other row). */
export function thinkTagMiddleware(args: {
  readonly reasoningKeys: readonly string[] | undefined;
  readonly tags: ReasoningTags | undefined;
}): LanguageModelMiddleware[] {
  if (args.reasoningKeys !== undefined) {
    return [];
  }
  const tagName = tagNameOf(args.tags);
  return tagName === undefined ? [] : [extractReasoningMiddleware({ tagName })];
}
