// IMP-1 probe — the READ-THROUGH-PRODUCTION prompt build.
//
// The wire request for one impersonate generation is assembled by the SERVER'S OWN code, reached through the
// same `substrate/assembly-access` seam `verbs/turn.ts` uses:
//
//   BUILD   buildPrompt(promptConfig, ctx)            → the static/dynamic system halves
//   NUDGE   resolveNudgeText(ctx, impersonateNudge)   → the rendered voice-lock ({{user}}/{{char}}/{{person}})
//   SHAPE   shapeTurn({... appendUserTurn: nudge})    → the wire history + name stamps + the trailing nudge row
//   WIRE    system = [static, dynamic].join("\n\n")   → exactly what the OpenRouter/vLLM runners send
//
// Only the HTTP call itself is hand-rolled (the `steer-probe-real` precedent): reaching the real runner would
// need a ResolvedConnection + credentials + capability descriptors, and the fidelity that matters here is the
// PROMPT, not the transport. Two production steps are deliberately skipped and named so the results can be
// read honestly: `toShapeCanon` (a MessageView→CanonRow map that only renders macros — the fixtures carry no
// macros in their bodies) and `buildWireHistory` (span tokenization for images/cards — the fixtures are plain
// prose). Sampling knobs are left UNSET, which is what the shipped default preset (`params: {}`) does.

import type { AssembleContext } from "@orb/contracts/chat";
import { DEFAULT_FORMAT_STRINGS } from "@orb/contracts/preset";
import { buildPrompt, resolveNudgeText, shapeTurn } from "../../../packages/server/src/domain/chat/substrate/assembly-access";
import type { ImpersonateFixture } from "./fixtures";
import { configFor } from "./fixtures";

export interface WireMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
  readonly name?: string;
}

export interface BuiltRequest {
  readonly messages: readonly WireMessage[];
  /** The rendered impersonateNudge (the trailing user row) — quoted in the results for receipts. */
  readonly nudge: string;
  /** The cast names a wrong-name scrub / stop-string layer would key on. */
  readonly castNames: readonly string[];
  readonly personaName: string;
}

/** The per-turn assemble context a real impersonate turn resolves for this fixture. */
function contextFor(fx: ImpersonateFixture): AssembleContext {
  return {
    character: fx.character,
    promptConfig: configFor(fx),
    cast: [...fx.cast],
    castCharacterIds: [...fx.castCharacterIds],
    recentMessages: fx.canon.map((r) => r.content),
    activePersona: fx.persona,
    pinnedPersona: fx.persona,
    generationType: "impersonate",
    lastMessage: fx.canon.at(-1)?.content,
  };
}

export function buildRequest(fx: ImpersonateFixture): BuiltRequest {
  const ctx = contextFor(fx);
  const assembled = buildPrompt(ctx.promptConfig, ctx);
  // `nudgeOf(assembleContext, "impersonateNudge", { person: guided?.person })` with no guided steer: `person`
  // is omitted, so the macro layer defaults it to "first" exactly as an unsteered production impersonate does.
  const nudge = resolveNudgeText(ctx, ctx.promptConfig.formatStrings?.impersonateNudge ?? DEFAULT_FORMAT_STRINGS.impersonateNudge);
  const shaped = shapeTurn({
    canon: assembled.sendHistory
      ? fx.canon.map((r) => ({ role: r.role, content: r.content, authorName: r.authorName, characterId: r.characterId ?? null }))
      : [],
    appendUserTurn: nudge,
    injections: assembled.afterHistory,
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    namesBehavior: ctx.promptConfig.namesBehavior ?? "default",
    speakers: { user: fx.persona.name, assistant: ctx.character.name },
    groupNudge: null,
  });

  const system = [assembled.static.trim(), assembled.dynamic.trim()].filter((part) => part.length > 0).join("\n\n");
  const messages: WireMessage[] = [];
  if (system.length > 0) {
    messages.push({ role: "system", content: system });
  }
  for (const row of shaped.history) {
    messages.push({ role: row.role, content: row.content, ...(row.name !== undefined ? { name: row.name } : {}) });
  }
  return { messages, nudge, castNames: fx.cast.map((c) => c.name), personaName: fx.persona.name };
}
