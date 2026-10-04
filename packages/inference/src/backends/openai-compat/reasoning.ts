// The openai-compat wire's reasoning spellings, one home for both transports: OpenRouter's nested `reasoning` block,
// the `reasoning_effort` word, the row's budget field, and the mandatory-reasoning refusal the OpenRouter replay
// reads. The funnel decided what runs (`funnel/resolve-chat.ts`); this file only spells it.

import type { JSONObject, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import type { EndpointFeatures } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { ResolvedReasoning, ResolvedWarning } from "../../contract/resolve.ts";
import { extractHttpErrorDiagnostic } from "../kit/error-classify.ts";
import { NO_PROVIDER_SECRETS } from "../kit/sanitize.ts";
import { wireEffortOf } from "../v4/options.ts";

const REASONING_OFF = "none";
const TEMPLATE_KWARGS_SWITCH = "chat_template_kwargs";
const EFFORT_WORD_SWITCH = "reasoning_effort";
const MANDATORY_REASONING_RE = /reasoning is mandatory/iu;
const EFFORT_UNSENT = "effort ignored: this endpoint's row spells no reasoning-effort field";
const BUDGET_UNSENT = "thinkingBudgetTokens ignored: this endpoint's row spells no reasoning-budget field";

/** OpenRouter's `reasoning` block. An off is `effort: "none"`, which OpenRouter forwards as the model's off. */
export function openRouterReasoning(reasoning: ResolvedReasoning): JSONObject {
  if (!reasoning.enabled) {
    return { effort: REASONING_OFF };
  }
  if (reasoning.budgetTokens !== undefined) {
    return { max_tokens: reasoning.budgetTokens };
  }
  // `max` rides verbatim only where it was measured: on the adaptive (Claude) rows OpenRouter forwards it upstream
  // as `output_config.effort: "max"` (gen-1790144375-ED228ncR3pymYMrZ25L3). Every other model keeps the V4 mapping
  // (`max` → `xhigh`), because a catalog with no allowlist folds to every level and cannot prove the upstream takes
  // `max`.
  if (reasoning.effort === undefined) {
    return { effort: "high" };
  }
  return { effort: reasoning.mode === "adaptive" ? reasoning.effort : wireEffortOf(reasoning.effort) };
}

/** Whether a turn sends OpenRouter's `reasoning` block: an unset effort sends none, so the model runs at its own
 *  default rather than a hidden off. */
export function sendsOpenRouterReasoning(reasoning: ResolvedReasoning): boolean {
  return reasoning.enabled || reasoning.offChosen === true;
}

/** The `reasoning_effort` word and the budget field one openai-compatible turn sends, and whether the template kwarg
 *  alone spells thinking off.
 *
 *  The effort word rides only where the row spells `reasoning_effort`. A chosen off is `none`, except on a row whose
 *  thinking switch is the template kwarg: there the kwarg body rule 5b sends is the off, and `none` beside it would
 *  contradict it. A row whose switch IS the effort word sends `none` whenever the template must not think. An unset
 *  effort sends nothing, so the model reasons at its own default. A level or a budget the row cannot spell is named. */
export function compatibleReasoning(
  features: EndpointFeatures,
  reasoning: ResolvedReasoning,
  templateThinking: boolean | undefined,
  warnings: ResolvedWarning[],
): { readonly word: LanguageModelV4CallOptions["reasoning"]; readonly body: Record<string, number>; readonly templateOff: boolean } {
  const spellsEffort = features.effort === EFFORT_WORD_SWITCH;
  if (reasoning.enabled && reasoning.effort !== undefined && !spellsEffort) {
    warnings.push({ code: "effort_dropped", message: EFFORT_UNSENT });
  }
  const word = spellsEffort ? effortWord(features, reasoning, templateThinking) : undefined;
  const templateOff = word === undefined && templateThinking === false && features.thinkingOff === TEMPLATE_KWARGS_SWITCH;
  return { word, body: budgetBody(features, reasoning, warnings), templateOff };
}

function effortWord(features: EndpointFeatures, reasoning: ResolvedReasoning, templateThinking: boolean | undefined): LanguageModelV4CallOptions["reasoning"] {
  if (templateThinking === false && features.thinkingOff === EFFORT_WORD_SWITCH) {
    return REASONING_OFF;
  }
  if (reasoning.enabled) {
    return reasoning.effort === undefined ? undefined : wireEffortOf(reasoning.effort);
  }
  if (templateThinking === false && features.thinkingOff === TEMPLATE_KWARGS_SWITCH) {
    return;
  }
  return reasoning.offChosen === true ? REASONING_OFF : undefined;
}

/** The thinking budget under the row's own body field, or a warning and nothing where the row names none. */
function budgetBody(features: EndpointFeatures, reasoning: ResolvedReasoning, warnings: ResolvedWarning[]): Record<string, number> {
  const budget = reasoning.enabled ? reasoning.budgetTokens : undefined;
  if (budget === undefined) {
    return {};
  }
  const field = features.reasoningBudgetField;
  if (field === undefined) {
    warnings.push({ code: "sampling_knob_dropped", knob: "thinkingBudgetTokens", message: BUDGET_UNSENT });
    return {};
  }
  return { [field]: budget };
}

/** True when the upstream refusal is a mandatory-reasoning endpoint rejecting an off: the OpenRouter replay's cue.
 *  The peeled strings never leave this function (no scrub sink). */
export function isMandatoryReasoningRejection(error: unknown): boolean {
  const diag = extractHttpErrorDiagnostic(error, NO_PROVIDER_SECRETS);
  return MANDATORY_REASONING_RE.test(`${diag.body ?? ""} ${diag.cause ?? ""} ${errorMessage(error)}`);
}
