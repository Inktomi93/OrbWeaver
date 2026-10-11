// verb: transformForDisplay — the per-row DISPLAY-transform round-trip (U6, seam 14; the
// ST message-formatting-hook parity row). The caller's own enabled plugins get to annotate ONE rendered row,
// in registration order, and the annotated text comes back to that same caller.
//
// WHY THE TEXT COMES FROM THE CLIENT, argued rather than assumed (the seam-14 ruling, 2026-08-28): the house
// display pipeline is CLIENT-SIDE and SYNCHRONOUS (`client/src/lib/message-render.ts` — macros → DISPLAY regex
// → markdown), so there is no server-side render path to hook, and a guest invoke is async and server-side. The
// two honest arms were "server re-reads canon and the client re-renders the result" and this one. This one
// wins on three counts:
//   1. LAW 6/7 BY CONSTRUCTION. The transformed text goes STRAIGHT to the markdown renderer — no macro plane is
//      entered downstream — so plugin-authored text never reaches `processMacros` and needs no neutralization.
//      The other arm would have to `neutralizeMacros` the whole row, killing the row's OWN legitimate macros.
//   2. STRICTLY LEAK-FREE. The guest sees only text the installer's client already had on screen: narrower
//      than the `chat.read` grant the plugin holds, and no new cross-domain read op exists to get it wrong.
//   3. The recorded ORDERING falls out: member macros → member DISPLAY regex → plugin display transforms →
//      markdown. Consequence, stated: a member's regex scripts cannot post-process a plugin annotation.
//
// THE TRUST POSTURE, once: `text` is CLIENT-SUPPLIED and is reflected ONLY to the same caller — no authority,
// no persistence and no other viewer's render derives from it. `PLUGIN_TEXT_MAX_CHARS` bounds it at the
// transport boundary; `PLUGIN_DISPLAY_TRANSFORM_DEADLINE_MS` bounds each guest call here.
//
// THE REFUSAL POSTURE IS D53's, verbatim: a transform that throws or outruns its deadline is SKIPPED — the fold
// keeps the prior text and moves on. A display transform can never blank a message, and it can never block one.

import type { PluginDisplayTransformRegistration } from "@orb/contracts/plugin";
import type { TransformForDisplayParams } from "../contract/params.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { listOwned } from "../persistence/plugins.ts";
import { logPluginFailure } from "../substrate/failure-log.ts";

/** The per-TRANSFORM wall-clock bound (the "per-message budget" seam 14 names). Tighter than the 250 ms
 *  `PROMPT_TRANSFORM_DEADLINE_MS` would be generous here for the opposite reason it is generous there: this
 *  runs once per VISIBLE ROW and its latency is a person watching a transcript paint, not a turn already
 *  waiting on a model. Overrun ⇒ that transform is skipped and the row keeps the text it had. */
export const PLUGIN_DISPLAY_TRANSFORM_DEADLINE_MS = 200;

/** One resident's crash-policy'd re-entry, curried to the (handler, argsJson) pair this seam uses. */
type ResidentInvoke = (handler: PluginDisplayTransformRegistration["handler"], argsJson: string, signal: AbortSignal) => Promise<string>;

/** Why a transform left the row's text alone. A throw or rejected invoke already reached the log through the
 *  resident's crash-policy'd `invoke`, so only a deadline overrun is logged here. */
type Outcome = { readonly text: string } | { readonly skip: "deadline" | "failed" };

/** Run ONE display transform under the deadline. Returns the new text, or why it was skipped (throw, rejected
 *  invoke, deadline) — the caller keeps the prior text. The timer is always cleared. */
async function applyBounded(invoke: ResidentInvoke, transform: PluginDisplayTransformRegistration, argsJson: string): Promise<Outcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Aborted on the deadline so the orphaned invocation's later rejection counts a crash without a second log line.
  const orphan = new AbortController();
  const deadline = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => {
      orphan.abort();
      resolve({ skip: "deadline" });
    }, PLUGIN_DISPLAY_TRANSFORM_DEADLINE_MS);
  });
  // @orb-waive caught-failure-ownership(catch): the rejection was already logged by the resident's `invoke`; the
  // caller keeps the row's prior text. Ends if `invoke` stops logging the failures it rethrows.
  try {
    const answer = await Promise.race([invoke(transform.handler, argsJson, orphan.signal), deadline]);
    return typeof answer === "string" ? { text: answer } : answer;
  } catch {
    return { skip: "failed" };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function createTransformForDisplay(ctx: PluginContext, registry: PluginRegistry): PluginService["transformForDisplay"] {
  return async ({ caller, chatId, messageId, text }: TransformForDisplayParams) => {
    // OWNER SCOPE by construction, the `listSurfaces` posture: `listOwned` reads only the caller's own rows, so
    // no foreign plugin can be reached and no foreign id is accepted — there is nothing to leak.
    const rows = await listOwned(ctx.db, caller.userId);
    // FLATTEN FIRST, fold second. Registration order within a plugin; plugin order is the caller's own install
    // order (`listOwned`). Both are the only orderings that exist here and both are the installer's own doing.
    const steps: { readonly slug: string; readonly transform: PluginDisplayTransformRegistration; readonly invoke: ResidentInvoke }[] = [];
    for (const row of rows) {
      const resident = registry.get(row.id);
      if (resident === undefined) {
        continue;
      }
      for (const transform of resident.instance.displayTransforms) {
        // The re-entry runs through the resident's crash-policy'd `invoke` (never `ctx.host.invoke` directly),
        // so a throwing/hung display transform bumps `consecutive_crashes` toward the 3-strike auto-disable
        // exactly like a tool, event or surface-action handler. `null` chat scope: a display transform reads the
        // text it was handed and nothing else — admitting a room would hand it a `chat.read` window this seam
        // has no reason to open.
        steps.push({ slug: row.slug, transform, invoke: (handler, json, signal) => resident.invoke(handler, json, null, signal) });
      }
    }
    if (steps.length === 0) {
      return { text };
    }
    // The ordered fold as an async chain (not a for-await loop) — each step sees the prior's output and the
    // inherently-sequential await needs no suppression; depth = the caller's own transform count.
    const foldFrom = async (index: number, current: string): Promise<string> => {
      const step = steps[index];
      if (step === undefined) {
        return current;
      }
      const argsJson = JSON.stringify({ text: current, env: { chatId, messageId } });
      const next = await applyBounded(step.invoke, step.transform, argsJson);
      if ("skip" in next && next.skip === "deadline") {
        logPluginFailure(step.slug, "display-deadline", `display transform '${step.transform.name}' exceeded ${PLUGIN_DISPLAY_TRANSFORM_DEADLINE_MS}ms`);
        return foldFrom(index + 1, current);
      }
      return foldFrom(index + 1, "text" in next ? next.text : current);
    };
    return { text: await foldFrom(0, text) };
  };
}
