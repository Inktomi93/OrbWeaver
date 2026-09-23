// The `/imagine` argument grammar — the ONE pure home for "what did
// the host mean by these /imagine args?", so the mount and its tests share one decision. A leading
// MODE_TRIGGER word (you/face/scene/background — the ONE map in `@orb/contracts/imagery`, never re-spelled:
// no-inline-union-redecl) selects an EXTRACTION mode and the rest is an optional refinement; anything else is
// a verbatim FREE-mode prompt. A bare `/imagine` is free mode with an empty prompt (the modal then requires
// one). The modal is the preview-before-spend surface — it resolves an extraction prompt via `extractPrompt`
// before any generation, so `/imagine you` never blind-spends.

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import { MODE_TRIGGERS } from "@orb/contracts/imagery";

/** The mode + seed prompt a `/imagine` invocation resolves to. */
export interface ImagineArgs {
  readonly mode: PromptTemplateMode;
  readonly prompt: string;
}

const FREE_MODE: PromptTemplateMode = "free";
/** First whitespace run — splits the trigger token from the refinement remainder. */
const WHITESPACE_RE = /\s/u;

/** The extraction mode a leading trigger word selects, or undefined when the token is not a trigger.
 *  Reads the ONE MODE_TRIGGERS map (no cast, no re-spelled trigger list). */
function triggeredMode(token: string): PromptTemplateMode | undefined {
  return Object.entries(MODE_TRIGGERS).find(([trigger]) => trigger === token)?.[1];
}

/** Parse `/imagine` args → the seed the imagine modal opens with. */
export function parseImagineArgs(args: string): ImagineArgs {
  const trimmed = args.trim();
  const firstSpace = trimmed.search(WHITESPACE_RE);
  const firstToken = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase();
  const mode = triggeredMode(firstToken);
  if (mode === undefined) {
    return { mode: FREE_MODE, prompt: trimmed };
  }
  const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();
  return { mode, prompt: rest };
}
