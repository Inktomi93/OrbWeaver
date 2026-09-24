// domain/automation — the ratified cross-domain root slot (D145 `teaching-contribution.ts`), third
// occupant: the S5 GUIDANCE DELIVERY. One ephemeral `in_chat` system
// injection carrying the chat's standing analysis guidance — the think-first pass's ONE narrator-facing
// instruction — merged onto the turn through chat's S2 collection like every other teaching contribution.
// Reachable ONLY through the front door (`index.ts`) and registered ONLY at `entry/compose` (the
// `domain-teaching-contribution-compose-only` cruiser stanza makes that physics).
//
// GUIDANCE IS DATA, NEVER A TEMPLATE (§2 law 6 — the whole reason this channel exists as it does): the
// stored bytes are MODEL-authored, and they ship VERBATIM inside the preset's `automation.guidance.frame`
// delimiter — a plain token splice, never `renderArmTemplate` or `processMacros`. The delivery plane is
// macro-inert BY CHANNEL: teaching injections merge into the assembly's injections splice, whose
// `resolveContent` hook is identity in production (`chat/assembly/injections.ts`) — so a model-authored
// `{{getglobalvar::…}}` reaches the assembled prompt as LITERAL BRACES (pinned). No `neutralizeMacros` here either: neutralization is for text entering a
// macro-EXECUTION plane (law 7), and this plane executes nothing — mutating the bytes would break the
// VERBATIM law for zero defense.
//
// AUTHORITY, fail-safe both directions (§3-S5.3): the read (`selectChatGuidance`) yields a row only when
// the rule is ENABLED and its AUTHOR is the turn's frozen resolved host — `ownerId = tctx.runAsUserId` IS
// "the author still holds host" by identity (D19: `runAsUserId` is resolved per turn), so a host handoff
// makes the very next turn read NOTHING while the ex-host's row simply ages with its rule. Disabling the
// rule stops delivery the same way. Guidance carries NO authority of its own (the §7 acceptance matrix:
// macro-inert prompt data).
//
// BYTE-IDENTITY (the A1 seam property, held per contributor): no enabled analysis rule / no stored
// guidance / a handed-off room ⇒ `{ injections: [], toolNames: [] }` ⇒ the merged teaching array is
// deep-equal to a registry without this contribution — pinned through the REAL `collectTeaching` (the
// B1 lesson: a fixture shaped unlike the real producer ratifies nothing).

import { resolveProseText } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import type { TeachingCollection, TeachingContext, TeachingContribution } from "#domain/chat";
import { selectChatGuidance } from "./persistence/rule-state.ts";

/** Fold position among contributions (chat's rpg projection = 0, tool-use's attach = 100). Order only
 *  decides the fold; the SPLICE position below is what places the line in the prompt. */
const ANALYSIS_GUIDANCE_ORDER = 50;

/** The guidance line's `in_chat` splice depth — the authors-note register (§3-S5.3; spec §9.3 left the
 *  value to the build). 4 = the ST authors-note convention this codebase's `chat_injections` rows follow:
 *  deep enough to sit ABOVE the newest exchange (the model reads the scene before the instruction loses
 *  adjacency), shallow enough to steer the NEXT turn. A domain constant, one home — never re-spelled. */
const ANALYSIS_GUIDANCE_DEPTH = 4;

const EMPTY: TeachingCollection = { injections: [], toolNames: [] };

/** The S5 guidance-delivery contribution. Takes only `db` (the one read it needs) — never the automation
 *  service: a teaching contribution is a pure read on the turn path, and handing it the front door would
 *  let a later edit reach verbs from a seam that must stay a read (the tool-use contribution's posture). */
export function createAutomationTeachingContributions(deps: { readonly db: Db }): readonly TeachingContribution[] {
  return [
    {
      id: "automation.analysis-guidance",
      order: ANALYSIS_GUIDANCE_ORDER,
      collect: async (tctx: TeachingContext): Promise<TeachingCollection> => {
        const guidance = await selectChatGuidance(deps.db, tctx.chatId, tctx.runAsUserId);
        if (guidance === null) {
          return EMPTY;
        }
        // A model that takes no system row folds this note into a player's message, so it carries its own
        // delimiter and never reads as that player's words (owner ruling).
        const content = resolveProseText("automation.guidance.frame", tctx.prose, { guidance });
        return {
          // VERBATIM bytes at the authors-note register — `origin` reuses the existing axis member (the
          // spec's own naming), so the host's budget breakdown accounts it with the other steering notes.
          injections: [{ position: "in_chat", depth: ANALYSIS_GUIDANCE_DEPTH, role: "system", content, origin: "authors-note" }],
          toolNames: [],
        };
      },
    },
  ];
}
