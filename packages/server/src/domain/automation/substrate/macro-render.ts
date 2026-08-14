// domain/automation/substrate/macro-render — the ONE arm-template render home, shared by the dry-run preview
// and the LIVE dispatch arms. Every arm `template` field renders through `kit/macro` against
// the dispatch CEL activation (which feeds `{{expr::…}}`), with the injected clock/PRNG and
// `strictArgs`. A strict-arg error becomes the arm's typed refusal instead of a silently-wrong render.

import type { AutomationCelEnv } from "@orb/contracts/automation";
import type { CelBindings } from "@orb/kit/cel";
import type { MacroDiagnostic, ProcessMacroOptions } from "@orb/kit/macro";
import { processMacros } from "@orb/kit/macro";
import type { ArmTemplateRender } from "../contract/ops.ts";

/** The CEL activation an arm template's `{{expr::…}}` reads — SANS `event` (assembly/render has no trigger;
 *  the predicate path binds `event` separately). */
function celBindingsForRender(env: AutomationCelEnv): CelBindings {
  return { vars: env.vars, choice: env.choice, global: env.global, chat: env.chat, now: env.now };
}

/** The macro-render options for an arm template: empty char/user/persona context (a rule template addresses
 *  room state via CEL/globals, not the per-turn MacroContext), the injected clock/PRNG (determinism), the
 *  author's globals for `{{getglobalvar}}`, the CEL activation for `{{expr::…}}`, and `strictArgs`. */
function armMacroOptions(input: ArmTemplateRender, diagnostics: MacroDiagnostic[]): ProcessMacroOptions {
  return {
    char: "",
    user: "",
    persona: "",
    scenario: "",
    env: input.macroEnv ?? {},
    nowMs: input.nowMs,
    random: input.prng,
    globalVars: input.env.global,
    celBindings: celBindingsForRender(input.env),
    strictArgs: true,
    diagnostics,
  };
}

/** One arm template rendered: the resolved text, OR the first strict-arg error (the arm refuses rather than
 *  fire a mis-rendered effect). Local — callers read `.text`/`.error` structurally. */
type ArmRender = { readonly text: string; readonly error?: undefined } | { readonly text?: undefined; readonly error: string };

/** Render an arm template against the dispatch env — the LIVE arm's produced value AND the dry-run preview
 *  read this ONE path (test-vs-live parity). */
export function renderArmTemplate(input: ArmTemplateRender): ArmRender {
  const diagnostics: MacroDiagnostic[] = [];
  const text = processMacros(input.template, armMacroOptions(input, diagnostics));
  const firstError = diagnostics.find((d) => d.severity === "error");
  return firstError === undefined ? { text } : { error: firstError.message };
}
