// domain/automation/substrate/dry-run — the `testRule` engine: build the CEL activation, evaluate
// the predicate, and MACRO-RENDER each arm's template — executing NOTHING (no injected op, no budget). The
// same `toCelBindings`/`nowFields` helpers the dispatch engine reuses to build its live env; here they run
// over a host-supplied sample. Determinism: the injected clock + prng feed the macro engine (test-determinism).
//
// `run_tool` previews its RENDERED ARGS (`argsTemplate`) and nothing else, which is this engine's whole
// contract: it answers "does my template render", the dominant authoring failure, without a spend. It does NOT
// answer "is that tool available right now" — that is a live-registry question the DISPATCH asks, and its
// answer is the D146-d PAUSE terminal a host sees from "Run now". Answering it here through `ArmPreview.error`
// would read as a template bug and would be a lie about what broke.

import type { AutomationAction, AutomationCelEnv, AutomationTrigger, TriggerFact } from "@orb/contracts/automation";
import type { CelBindings } from "@orb/kit/cel";
import { CelEvalError, evalCel, isCelParseError, parseCel } from "@orb/kit/cel";
import type { ChatId } from "@orb/kit/ids";
import type { ArmTemplateRender } from "../contract/ops.ts";
import type { ArmPreview } from "../contract/results.ts";
import { renderArmTemplate } from "./macro-render.ts";

/** The `now` projection CEL binds — UTC hour + day-of-week off the injected epoch (deterministic). */
export function nowFields(epochMs: number): AutomationCelEnv["now"] {
  const d = new Date(epochMs);
  return { epochMs, hour: d.getUTCHours(), dayOfWeek: d.getUTCDay() };
}

/** Flatten the env into the CEL activation's named bindings. `event` is present only for a predicate (a
 *  `{{expr::…}}` render passes `withEvent:false` — assembly has no trigger), and the three CHAT-KEYED roots
 *  are present only for a chat-scoped frame (C5 — `substrate/macro-render.ts` states why the omission is the
 *  point: an unbound root ERRORS, an empty one LIES). */
function toCelBindings(env: AutomationCelEnv, withEvent: boolean, chatScoped: boolean): CelBindings {
  const base: CelBindings = chatScoped
    ? { vars: env.vars, choice: env.choice, global: env.global, chat: env.chat, now: env.now }
    : { global: env.global, now: env.now };
  return withEvent && env.event !== undefined ? { ...base, event: env.event } : base;
}

/** Synthesize a minimal fact from a rule's trigger when the host supplies no sample. */
export function synthFact(trigger: AutomationTrigger, chatId: ChatId | null): TriggerFact {
  return { type: trigger.type, bus: trigger.bus, chatId };
}

/** Evaluate a rule predicate: `null` ⇒ always fire (`true`); a parse/eval error or a non-boolean result
 *  ⇒ the error branch (the dry-run surfaces it without a spend). `chatScoped` decides whether the chat-keyed
 *  roots are bound at all — for an owner-global rule they are not, so a chat-keyed predicate that somehow
 *  reached storage answers `predicate_error` rather than evaluating against an invented empty room (the
 *  mint refusal is the first belt; this is the second). */
export function evaluatePredicate(predicateCel: string | null, env: AutomationCelEnv, chatScoped: boolean): boolean | { readonly error: string } {
  if (predicateCel === null || predicateCel === "") {
    return true;
  }
  const program = parseCel(predicateCel);
  if (isCelParseError(program)) {
    return { error: program.message };
  }
  try {
    const result = evalCel(program, toCelBindings(env, true, chatScoped));
    if (typeof result !== "boolean") {
      return { error: "predicate must evaluate to a boolean" };
    }
    return result;
  } catch (err) {
    return { error: err instanceof CelEvalError ? err.message : String(err) };
  }
}

/** The primary rendered template of an arm — the string the preview shows. Arms with no template return
 *  `undefined` (nothing to render). */
function armTemplate(action: AutomationAction): string | undefined {
  // The `surface_quick_reply` arm joins its choice send-templates; every other arm exposes ONE template
  // field. A property-bag read (not a discriminated switch) is deliberate: biome's type engine resolves
  // the zod-inferred `AutomationAction` union as `never` across the `#imagery`-`.extend`ed member (a
  // cross-subpath-import inference gap — tsgo resolves the union correctly), so a `switch (action.type)`
  // trips noUnnecessaryConditions "unreachable" on every case. The reserved arms carry no template field
  // (createRule refuses them — a stored rule never reaches here) and fall through to `undefined`.
  if ("choices" in action) {
    return action.choices.map((c) => c.sendTemplate).join(" | ");
  }
  const rec: Record<string, unknown> = action;
  // `brief` is `run_analysis`'s primary template (its host-authored task). The preview answers "does my
  // template render" ONLY — it never runs the model pass (the same no-spend contract as `run_tool`'s
  // args-only preview, stated in the header).
  const template =
    rec["value"] ??
    rec["template"] ??
    rec["contentTemplate"] ??
    rec["messageTemplate"] ??
    rec["guidedTemplate"] ??
    rec["prompt"] ??
    rec["argsTemplate"] ??
    rec["brief"];
  return typeof template === "string" ? template : undefined;
}

/** Everything a preview render needs EXCEPT the template itself — a slice of the ONE render seam
 *  ({@link ArmTemplateRender}) rather than a second parameter list, so `chatScoped` and the injected
 *  clock/PRNG cannot drift between the dry run and the live arm. Also what keeps this under the 4-param bar. */
type ArmPreviewContext = Omit<ArmTemplateRender, "template" | "macroEnv">;

/** Render one arm to a preview: the macro-rendered template, or a first-error message when strict-arg
 *  validation flags the template. Executes NO op. A `transform_draft` template addresses `{{draft}}` (the
 *  turn's live target text, unknown at test time) — the preview seeds it EMPTY so the render exercises the
 *  rest of the template without a strict `unknown-macro` error on the absent draft. */
export function renderArmPreview(action: AutomationAction, render: ArmPreviewContext): ArmPreview {
  const template = armTemplate(action);
  if (template === undefined) {
    return { type: action.type };
  }
  const macroEnv = action.type === "transform_draft" ? { draft: "" } : undefined;
  const rendered = renderArmTemplate({ ...render, template, ...(macroEnv !== undefined ? { macroEnv } : {}) });
  return rendered.error === undefined ? { type: action.type, renderedPreview: rendered.text } : { type: action.type, error: rendered.error };
}

/** The empty-context env for a dry run with no live chat vars/choice. `global` is the author's own
 *  plane (read via the global-var persistence); `chat` carries the id + message count. */
export function emptyDryRunEnv(parts: {
  /** `null` on an owner-GLOBAL rule. The `chat` projection is still BUILT (the ruled env keeps the field
   *  required), and it is never BOUND for such a rule — see {@link toCelBindings}. */
  chatId: ChatId | null;
  messageCount: number;
  global: Record<string, string>;
  event: TriggerFact;
  nowMs: number;
}): AutomationCelEnv {
  return {
    event: parts.event,
    vars: {},
    choice: {},
    global: parts.global,
    chat: { id: parts.chatId ?? "", messageCount: parts.messageCount },
    now: nowFields(parts.nowMs),
  };
}
