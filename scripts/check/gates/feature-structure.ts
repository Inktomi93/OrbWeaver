// Gate: feature-structure (core/Core-0-Architecture-and-Structure.md §7) — every domain feature follows the per-feature template.
// Requires the universal slots: index.ts (front door), service.ts (composition root), context.ts
// (DI bundle), and contract/ + verbs/ dirs. persistence/ and substrate/ are per-feature (export has
// no persistence/; chat/workloads have no substrate/), so they are NOT required here.
//
// Documented exceptions to "only index/service/context at root":
// - `guard.ts` is a ratified, cross-domain 9th slot (Core-Laws-and-Precedents.md "Committed decisions" —
//   the `can()` authority seam: `requireAdmin` lives in `domain/admin/guard.ts`). It's an I/O-touching,
//   non-verb gate primitive — can't live in zero-I/O `substrate/`, isn't a verb. Allowed at ANY domain root.
// - `workload-contributions.ts` is the ratified, cross-domain 10th slot (the workloads junk-drawer exit):
//   the domain's OWN background-work contributions, compose-built over its own verbs. Same shape of
//   exception as guard.ts — I/O-touching, not a verb, and cross-domain by construction.
// - A handful of domain-specific root singletons, each individually justified inline below
//   (`DOMAIN_SPECIFIC_ROOT_FILES`) but not yet promoted to the cross-domain ledger.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const DOMAIN_REL = "packages/server/src/domain";
const REQUIRED_FILES = ["index.ts", "service.ts", "context.ts"] as const;
const REQUIRED_DIRS = ["contract", "verbs"] as const;

/** Cross-domain ratified root slots, allowed at ANY domain root:
 *  - `guard.ts` — the ratified `can()` authority-seam pattern (Core-Laws-and-Precedents.md,
 *    Identity/auth/permission "Committed decisions").
 *  - `workload-contributions.ts` — the ONE home of a domain's background-work contributions (the
 *    workloads junk-drawer exit: domains raise seams, the worker skims them). A compose-built factory
 *    over the domain's OWN verbs, so it can't live in zero-I/O `substrate/` and it isn't a verb; naming
 *    it as a cross-domain slot is what makes "where does this domain's queued work live?" answerable
 *    without reading the queue. */
const ALWAYS_ALLOWED_ROOT_FILES = ["guard.ts", "workload-contributions.ts"] as const;

/** Domain-specific root singletons — each justified here, since this allowlist IS the source of truth:
 *  - chat: `bus.ts` (chat bus emitter + replay ring), `active-turns.ts` (in-memory controller Set) —
 *    neither fits verbs/substrate/a subsystem.
 *  - preset: `constants.ts` (SYSTEM_DEFAULT_PRESET_ID, domain-internal), `seed.ts` (boot-time
 *    ensureSystemDefaultPreset — too small to be its own subsystem).
 *  - settings: `constants.ts` (the theme seed sentinel TypeIDs, domain-internal), `seed-themes.ts`
 *    (boot-time `ensureSeedThemes` — the preset `seed.ts` precedent, named `-themes` since the domain
 *    root's `seed.ts` slot may host a different concern later).
 *    precedent; a feature-root collaborator the observer emits onto, PD-45).
 *  - crew: `bus.ts` (the crew's per-CHAT event feed emitter + replay ring — the buddy/bus.ts precedent;
 *    a feature-root collaborator the verbs/appliers emit onto, chat-crew-design/04 §4).
 *  - rpg: `bus.ts` (the rpg's per-CHAT SSE event bus emitter + replay ring with the host/member hidden-clock
 *    split — the crew/bus.ts precedent; a feature-root collaborator the verbs emit onto, rpg-design/05 §5),
 *    `staging.ts` (the Option-A per-turn tool-write staging accumulator singleton — an in-memory Map the tool
 *    verbs stage into + the commit/abort hooks flush/clear, the chat/active-turns.ts precedent; rpg-design/10 §R4),
 *    `turn-staging.ts` (the verb-facing I/O ops over that accumulator — resolve the turn's base snapshot, read/
 *    write the overlay, resolve name refs to party rows; the guard.ts I/O-wrapping-root precedent, shared by the
 *    tool-path verbs so `staging.ts` stays the pure in-memory accumulator; rpg-design/10 §R4 / 05 §3),
 *    `snapshot-edit.ts` (the verb-facing HAND-edit I/O over the CURRENT resolved snapshot — resolve the
 *    ladder head, apply a [merge-clear] overlay + auto-lock, write back in place; the `turn-staging.ts`
 *    I/O-wrapping-root precedent, shared by editSnapshot/upsertQuest/deleteQuest so verb-to-verb VALUE imports
 *    stay banned; rpg-design/05 §4.4),
 *    `seat.ts` (the ONE FK-walk resolving a game's `gmUserId` into the `RpgGmSeat` the pure deciders
 *    substrate/auth read — it AWAITS the injected `identity.resolvePartyActorKind` op, so it can't live in
 *    zero-I/O `substrate/`; the `turn-staging.ts` I/O-wrapping-root precedent, called at the three GM-seat
 *    re-key dispatch points; D60 AP4a / agent-principal-design/05 §2),
 *    `trace.ts` (the compose-created RPG flight-recorder singleton — a bounded in-memory ring of the per-turn
 *    trace-event stream + its injected sink, the `bus.ts`/`staging.ts` in-memory-singleton precedent; wired
 *    opt-in as `RpgContext.trace`, read host-only by `/api/_debug`; R-OBS, D55 memoryTrace precedent),
 *    `encounter-commit.ts` (the ONE durable "commit a resolved encounter round" path — the encounter row
 *    read/write + terminal side-effect writes — shared by the post-turn FLUSH and the human-GM CONSOLE arms so
 *    a tool-path and console-path terminal round produce byte-equivalent durable state; the `turn-staging.ts`
 *    I/O-wrapping-root precedent, RPG-CONSOLE-COMMIT),
 *    `game-mint.ts` (the ONE lite-game BIRTH mechanism — row + pointer mirror + bus emit — shared by the
 *    caller-gated createGame verb AND the chat-ops draft-time `startGame` door so the #40 front door never
 *    re-spells the birth; the `snapshot-edit.ts` I/O-wrapping-root precedent),
 *    `flush-barrier.ts` (the per-chat in-flight-flush BARRIER singleton — an in-memory Map the post-turn flush
 *    registers into + the next turn's gather awaits, so a fast re-send reads the just-committed state, not stale
 *    state; the `staging.ts`/`bus.ts` in-memory-singleton precedent; the dedicated state round made the flush a
 *    real 0.8-2.9s call, so the race is real — rpg-design/05 §4.6 delivery-model amendment).
 *  - stats: `reconcile-in-flight.ts` (the per-USER single-flight gate for the awaited `stats.reconcile` verb —
 *    an in-memory Set the verb claims/releases around the rebuild, so a second concurrent recompute is refused
 *    with CONFLICT instead of racing the first over the same rollup rows; the `chat/active-turns.ts`
 *    in-memory-registry precedent, owner ruling 2026-08-02). */
const DOMAIN_SPECIFIC_ROOT_FILES: Readonly<Record<string, readonly string[]>> = {
  chat: ["bus.ts", "active-turns.ts"],
  crew: ["bus.ts"],
  rpg: ["bus.ts", "staging.ts", "turn-staging.ts", "snapshot-edit.ts", "seat.ts", "trace.ts", "encounter-commit.ts", "flush-barrier.ts", "game-mint.ts"],
  preset: ["constants.ts", "seed.ts"],
  "roster-preset": ["constants.ts"], // MIN/MAX member sizing rail (domain-internal, saved-rosters §3)
  settings: ["constants.ts", "seed-themes.ts"],
  stats: ["reconcile-in-flight.ts"],
};

function isAllowedRootFile(feature: string, fileName: string): boolean {
  const allNames: readonly string[] = REQUIRED_FILES;
  if (allNames.includes(fileName) || (ALWAYS_ALLOWED_ROOT_FILES as readonly string[]).includes(fileName)) {
    return true;
  }
  return (DOMAIN_SPECIFIC_ROOT_FILES[feature] ?? []).includes(fileName);
}

function checkRequiredSlots(featureDir: string, feature: string): Violation[] {
  const violations: Violation[] = [];
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(featureDir, file))) {
      violations.push({
        file: `${DOMAIN_REL}/${feature}/${file}`,
        line: 0,
        message: `missing template file '${file}' (8-slot per-feature template, Core-0-Architecture-and-Structure.md §4)`,
      });
    }
  }
  for (const dir of REQUIRED_DIRS) {
    if (!existsSync(join(featureDir, dir))) {
      violations.push({
        file: `${DOMAIN_REL}/${feature}/${dir}/`,
        line: 0,
        message: `missing template dir '${dir}/' (8-slot per-feature template, Core-0-Architecture-and-Structure.md §4)`,
      });
    }
  }
  return violations;
}

function checkLooseFiles(featureDir: string, feature: string): Violation[] {
  const violations: Violation[] = [];
  for (const entry of readdirSync(featureDir, { withFileTypes: true })) {
    if (entry.isFile() && !isAllowedRootFile(feature, entry.name)) {
      violations.push({
        file: `${DOMAIN_REL}/${feature}/${entry.name}`,
        line: 0,
        message: `loose file '${entry.name}' not allowed at feature root (must be index.ts, service.ts, context.ts, guard.ts, or a domain-specific documented root file — Core-0-Architecture-and-Structure.md §4)`,
      });
    }
  }
  return violations;
}

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanFeatureStructure(root: string): Violation[] {
  const violations: Violation[] = [];
  const domainDir = join(root, DOMAIN_REL);
  if (!existsSync(domainDir)) {
    return violations;
  }
  for (const feature of readdirSync(domainDir)) {
    const featureDir = join(domainDir, feature);
    if (!statSync(featureDir).isDirectory()) {
      continue;
    }
    violations.push(...checkRequiredSlots(featureDir, feature), ...checkLooseFiles(featureDir, feature));
  }
  return violations;
}

export const gate: GateDescriptor = {
  name: "feature-structure",
  docRow: "core/Core-0-Architecture-and-Structure.md §7 (§4)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a domain feature does not follow the per-feature template — it is missing a required slot (index.ts / service.ts / context.ts / contract/ / verbs/) or carries a loose non-template file at its root (Core-0-Architecture-and-Structure.md §4).",
  fix: "add the missing template slot, or move the loose file into verbs/ / substrate/ / a subsystem (only index/service/context/guard + documented singletons live at the feature root).",
  run: (ctx) => {
    for (const v of scanFeatureStructure(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: { "packages/server/src/domain/broken/index.ts": "export const x = 1;\n" },
      expect: { messageIncludes: "missing template" },
      why: "a domain feature with only index.ts — missing service.ts/context.ts/contract/verbs (§4)",
    },
    {
      files: {
        "packages/server/src/domain/loose/index.ts": "export const x = 1;\n",
        "packages/server/src/domain/loose/service.ts": "export const s = 1;\n",
        "packages/server/src/domain/loose/context.ts": "export const c = 1;\n",
        "packages/server/src/domain/loose/contract/service.ts": "export const cs = 1;\n",
        "packages/server/src/domain/loose/verbs/x.ts": "export const v = 1;\n",
        // all required slots present, but a non-template file sits at the feature root.
        "packages/server/src/domain/loose/helpers.ts": "export const h = 1;\n",
      },
      expect: { messageIncludes: "loose file 'helpers.ts' not allowed" },
      why: "a feature with every required slot PLUS a loose non-template root file — the checkLooseFiles arm",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/domain/whole/index.ts": "export const x = 1;\n",
        "packages/server/src/domain/whole/service.ts": "export const s = 1;\n",
        "packages/server/src/domain/whole/context.ts": "export const c = 1;\n",
        "packages/server/src/domain/whole/contract/service.ts": "export const cs = 1;\n",
        "packages/server/src/domain/whole/verbs/x.ts": "export const v = 1;\n",
      },
      why: "a feature with all required slots (index/service/context + contract/ + verbs/) — the template, passes",
    },
  ],
};
