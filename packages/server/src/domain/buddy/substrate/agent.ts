// domain/buddy/substrate/agent — the SUBSTRATE MEDIATOR for the `agent/` subsystem (the curated tool
// specs + the soul system-prompt). `domain-substrate-mediates-subsystems`: `ask` reaches the agent
// builders ONLY through `substrate/`, never the named subsystem directly. Composes the two pure builders
// into the single "agent turn inputs" the verb hands to the injected `agentTurn`.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { buildBuddySystemPrompt } from "../agent/system-prompt";
import { createBuddyTools } from "../agent/tools";
import type { BuddyToolSpec } from "../contract/agent-turn";

/** The soul system-prompt ALONE — the agent's identity with NO hands (D60 room turn: a plain roleplay turn,
 *  no tools — doc 04 §5). `resolveSpeakerIdentity` uses this to voice a seated buddy in a chat room; the solo
 *  `ask` path uses {@link buildAgentInputs} (soul + tools). `soul`/`growth` null/absent before hatch. */
export function buildSoulPrompt(
  soul: { readonly name: string; readonly personality: string } | null,
  growth?:
    | { readonly formTitle: string; readonly formBlurb: string; readonly bondTier: string }
    | undefined,
): string {
  return buildBuddySystemPrompt(soul, growth);
}

/** Build the agent-turn inputs: the soul system-prompt (the identity) + the curated tool specs (handed to
 *  the injected `buildToolServer`). `soul`/`growth` are null/absent before hatch. */
export function buildAgentInputs(args: {
  readonly soul: { readonly name: string; readonly personality: string } | null;
  readonly growth?:
    | { readonly formTitle: string; readonly formBlurb: string; readonly bondTier: string }
    | undefined;
  readonly db: Db;
  readonly userId: UserId;
  readonly now: () => number;
  readonly newProposalId: () => string;
}): { systemPrompt: string; toolSpecs: BuddyToolSpec[] } {
  return {
    systemPrompt: buildBuddySystemPrompt(args.soul, args.growth),
    toolSpecs: createBuddyTools({
      db: args.db,
      userId: args.userId,
      now: args.now,
      newProposalId: args.newProposalId,
    }),
  };
}
