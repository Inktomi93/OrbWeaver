// domain/tool-use — THE RATIFIED 11th ROOT SLOT (D145's `teaching-contribution.ts`), second occupant: the
// per-turn attach of the turn host's OWN contributor (plugin) tools. Same exception shape as chat's own:
// not a verb, cross-domain by construction, and reachable ONLY through the front door (`index.ts`) so the
// composition root assembles it and no verb can call it inline (the `domain-teaching-contribution-compose-only`
// cruiser stanza is what makes that physics rather than etiquette).
//
// WHY THIS DOMAIN OWNS IT, and not `domain/plugin`: the question a contribution answers here is "which
// registry entries may this turn's host drive", and the registry — with the ownership column D146-c gives it —
// lives here. `domain/plugin` holds the lifecycle and the sandbox; it does not hold the entries, and routing
// this through it would mean a second read path onto a Map this domain already owns.
//
// D146 clause-by-clause, because this is the first consumer of that regime and the ledger is not what the next
// author will read — this header is:
//   (a) VOCABULARY CLOSED, INSTANCES OPEN. The seam this plugs into (`TeachingCollection.toolNames`) is an
//       OPEN `readonly string[]` field on a CLOSED contributor list (D145) — so a plugin extends what a turn's
//       model can do without any union growing. Nothing here mints a type per plugin.
//   (b) REFUSAL IS PER-CONTRIBUTOR. There is nothing here that can throw for one plugin and take the turn
//       down: the read is a filter over a Map. Note that the teaching seam does NOT swallow errors (D145-e —
//       a contribution that throws FAILS the turn, deliberately, because teaching is prompt content), which is
//       precisely why this contribution is a pure read with no I/O, no db, and no guest re-entry.
//   (d) THE CONTRIBUTOR MAY VANISH. This is the clause that dictates the shape: the names are read from the
//       LIVE registry at collect time, never from a stored list, so a plugin the host disabled between turns
//       simply is not in the union. That matters more than it looks — `resolveTools` THROWS on an unknown name
//       at attach ("at attach time an unknown name is OUR wiring bug"), so a cached or persisted attach list
//       would turn an ordinary "I turned my plugin off" into a failed turn.
//   (e) NO RENDERER PLANE. An attached tool the client has no `ToolRenderer` for renders the generic
//       `ToolCallBlock`. That is the correct answer for a contributor, not a gap: the render plane stays a
//       place where untrusted code does not run.
//
// SCOPE — whose tools reach whose room. The attach set is the TURN HOST's (`tctx.runAsUserId`, the turn's
// frozen D19 identity), never the sending member's and never "every plugin resident in the process". A guest
// in someone's room cannot pull their own plugin's tools into it, and the room's own host cannot pull a
// room-mate's (`substrate/reachability.ts` states why the PL-C ceiling is not sufficient for that question).
//
// NO INJECTIONS, deliberately. D145-a says teach and attach travel together, and they do here — the WIRE
// carries the teaching for a tool. Every attached tool ships its own `description` in its declaration
// (`toToolDefinitions`, placed on the wire by `@orb/inference`), which is the model's native, structured
// channel for exactly this; adding a prose
// injection that re-states it would spend the prompt budget twice to say one thing and would put
// contributor-authored text into the prompt body, which the wire channel does not do.

import type { TeachingCollection, TeachingContext, TeachingContribution } from "#domain/chat";
import type { ToolUseService } from "./contract/service.ts";

/** The contribution's ORDER. After chat's own rpg-gather projection (order 0) so a game's state block always
 *  leads; the value only decides fold position, and this contribution emits no injections, so it is the
 *  attach union's order alone. */
const PLUGIN_TOOL_ATTACH_ORDER = 100;

/** The per-turn plugin-tool attach contribution.
 *
 *  `listDrivableToolNames` is injected (the service's own read) rather than the whole service: the contribution
 *  needs exactly one answer and handing it the registry front door would let a later edit reach `register` or
 *  `executeToolCalls` from a seam that must stay a pure read. */
export function createToolUseTeachingContributions(deps: {
  readonly listDrivableToolNames: ToolUseService["listDrivableToolNames"];
}): readonly TeachingContribution[] {
  return [
    {
      id: "tool-use.plugin-tools",
      order: PLUGIN_TOOL_ATTACH_ORDER,
      collect: (tctx: TeachingContext): Promise<TeachingCollection> =>
        // Async by contract, synchronous in fact — a Map filter. Kept off `async` so it adds no microtask to
        // the per-turn fold; `collectTeaching` awaits every contribution in parallel either way.
        Promise.resolve({ injections: [], toolNames: deps.listDrivableToolNames(tctx.runAsUserId) }),
    },
  ];
}
