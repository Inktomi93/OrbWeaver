// verb: ask — the agent-mode composition (the ONE turn path via the injected `agentTurn`; "no second
// agent system"). Resolves the agent connection (the brain + the owner-gated
// credential + the capability window), builds the soul system-prompt + the egocentric view (recent turns,
// budget-trimmed), builds the in-process tool server, and runs the injected agent turn. THE FIREWALL: the
// request carries NO `chatId` — the buddy writes `buddy_turns`, never chat `messages`. The
// kill switch (`agencyEnabled`) short-circuits BEFORE any turn. Owner-scoped by `principal.userId`.

import type { AskBuddyParams } from "../contract/params";
import type { BuddyContext, BuddyService } from "../contract/service";
import { appendTurn, growBond, loadBuddy, loadTurns } from "../persistence/queries";
import { buildAgentInputs } from "../substrate/agent";
import { pendingProposal } from "../substrate/gate";
import { bondTierOf, formOf } from "../substrate/mood";
import { buildPromptWithMemory, fitSeedToBudget, MEMORY_TURNS } from "../substrate/view";

// Talking grows the relationship faster than passive reactions.
const BOND_PER_CHAT = 3;
// Window discipline (DERIVED from the connection capability window, NOT a literal): the seed
// transcript may use this share of the window; the SDK working set is soft-capped at this share.
const SEED_FRACTION = 0.4;
const CONTEXT_FRACTION = 0.85;

export function createAsk(ctx: BuddyContext): BuddyService["ask"] {
  return async (params: AskBuddyParams) => {
    const userId = params.principal.userId;
    const row = await loadBuddy(ctx.db, userId);
    // Kill switch: with the hands off, no tool-using turn runs at all (the capability ceiling).
    if (row !== null && !row.agencyEnabled) {
      return { reply: "(my hands are switched off right now — flip agency back on to chat)" };
    }

    // The brain + the owner-gated credential + the capability window (the owner gate lives inside
    // credential resolution, D17; buddy carries no router/model literal).
    const conn = await ctx.resolveAgentConnection({ principal: params.principal });
    const windowTokens = conn.capability.context.window;
    const seedBudget = Math.floor(windowTokens * SEED_FRACTION);
    const maxContextTokens = Math.floor(windowTokens * CONTEXT_FRACTION);

    const soul = row ? { name: row.name, personality: row.personality } : null;
    const growth = row
      ? {
          formTitle: formOf(row.stats).title,
          formBlurb: formOf(row.stats).blurb,
          bondTier: bondTierOf(row.bondXp),
        }
      : undefined;

    // Read history BEFORE persisting this turn's user line (the prompt builder appends it separately),
    // then trim oldest-first to the seed budget so a few long replies can't push the seed past the window.
    const recentTurns = await loadTurns(ctx.db, userId, MEMORY_TURNS);
    const history = fitSeedToBudget(recentTurns, seedBudget);

    // Persist the user line BEFORE the (multi-second) agent turn: a crash mid-turn must not drop what the
    // user said. The assistant line is persisted after (transcript order: user precedes assistant).
    await appendTurn(ctx.db, {
      id: ctx.newTurnId(),
      userId,
      role: "user",
      content: params.message,
      createdAt: ctx.now(),
    });

    // The agent-turn inputs (soul prompt + curated tool specs) — composed through the substrate mediator
    // (the verb reaches the `agent/` subsystem only via substrate/).
    const { systemPrompt, toolSpecs } = buildAgentInputs({
      soul,
      growth,
      db: ctx.db,
      userId,
      now: ctx.now,
      newProposalId: ctx.newProposalId,
    });
    const toolServer = ctx.buildToolServer(toolSpecs);

    const result = await ctx.agentTurn({
      credential: conn.credential,
      model: conn.model,
      systemPrompt,
      prompt: buildPromptWithMemory(history, row?.name ?? null, params.message),
      toolServer,
      maxContextTokens,
    });

    await appendTurn(ctx.db, {
      id: ctx.newTurnId(),
      userId,
      role: "assistant",
      content: result.text,
      createdAt: ctx.now(),
    });

    // Talking grows the bond (only when hatched — a row exists). Server-side increment (the row was read
    // before the multi-second turn, so a read-modify-write would lose a concurrent ask's increment).
    if (row !== null) {
      await growBond(ctx.db, userId, BOND_PER_CHAT, ctx.now());
    }

    // A propose_* tool may have stashed a pending action this turn — surface it so the UI can render
    // Confirm/Cancel. Only `buddy.confirm` executes it.
    const proposal = pendingProposal(userId, ctx.now());
    return {
      reply: result.text,
      ...(proposal
        ? { proposal: { id: proposal.id, kind: proposal.kind, summary: proposal.summary } }
        : {}),
    };
  };
}
