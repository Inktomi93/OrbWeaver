// domain/character/substrate/greeting-studio — the pure prompt-build shared by the two greeting-studio verbs
// (audit §3). NO I/O: it turns an owned card + the caller's editable template + the picked transform kinds +
// the host's free text (+ the optional base greeting for a rewrite) into the ONE bounded-completion prompt
// string. The steer COMPOSITION lives here too since the fork moved it server-side — see
// `composeGreetingSteer`.
//
// Macro resolution mirrors the automation arm-render precedent (`automation/substrate/macro-render`): a
// minimal `ProcessMacroOptions` built from the CARD (a greeting is authored against the card, not a live
// chat/persona — there is no turn context here), then `resolveGuidedInstruction` (kit/guided) does the
// guided-only pre-substitution: `{{input}}` = the ZWSP-neutralized steer, `{{base}}` = the ZWSP-neutralized
// existing greeting (other-author content — the same injection defense). `{{char}}`/`{{user}}`/`{{scenario}}`
// resolve against the card so the template reads naturally.

import type { CharacterCard } from "@orb/contracts/character";
import type { GreetingTransformId } from "@orb/contracts/preset";
import { GREETING_TRANSFORMS } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveSteerFragments } from "@orb/contracts/prose";
import { composeRewriteSteer, resolveGuidedInstruction } from "@orb/kit/guided";
import type { ProcessMacroOptions } from "@orb/kit/macro";

// The user-facing name in an authoring-time greeting (no persona is bound at card-editing time — a greeting
// is written for whoever loads the card, so the neutral second person is the honest {{user}} stand-in). The
// character/scenario come from the card itself.
const AUTHORING_USER_NAME = "You";

/** Build the card-scoped macro options a greeting template resolves against (the automation arm-render
 *  precedent — a non-chat, non-persona ProcessMacroOptions). `env: {}` is a valid empty MacroEnv. */
function cardMacroOptions(card: CharacterCard): ProcessMacroOptions {
  // Card fields are nullable (`string | null`); the macro context wants a string for `scenario` and
  // `string | undefined` for the shortcuts (a missing field renders "").
  return {
    char: card.name,
    user: AUTHORING_USER_NAME,
    persona: AUTHORING_USER_NAME,
    scenario: card.scenario ?? "",
    description: card.description ?? undefined,
    personality: card.personality ?? undefined,
    exampleMessages: card.exampleMessages ?? undefined,
    env: {},
  };
}

/**
 * The steer text a greeting-studio request's `{{input}}` receives: the picked transform KINDS resolved to
 * their `preset.greetingTransform.*` prose sentences and joined — in CATALOG order — ahead of the host's own
 * free text (the templating fork's ARM B, owner 2026-08-09). No picks ⇒ the free text VERBATIM.
 *
 * The join is the SAME pure `composeRewriteSteer` the browser ran before the fork, over the same fragment
 * bytes (now the slots' shipped defaults), so an un-overridden preset composes a byte-identical steer. What
 * changed is that a host CAN override them, and that the wire no longer carries prompt text.
 */
export function composeGreetingSteer(transforms: readonly GreetingTransformId[] | undefined, freeText: string, prose: ProseOverrides): string {
  if (transforms === undefined || transforms.length === 0) {
    return freeText;
  }
  return composeRewriteSteer(resolveSteerFragments(GREETING_TRANSFORMS, transforms, prose), freeText);
}

/** Resolve the final bounded-completion prompt for a greeting-studio request. `base` (the existing greeting)
 *  is passed ONLY for a rewrite — it fills the `{{base}}` token (neutralized in the kit resolver); a
 *  new-greeting request omits it and its template never contains the token. */
export function buildGreetingPrompt(args: { readonly card: CharacterCard; readonly template: string; readonly steer: string; readonly base?: string }): string {
  const opts = args.base === undefined ? undefined : { base: args.base };
  return resolveGuidedInstruction(args.template, args.steer, cardMacroOptions(args.card), opts);
}
