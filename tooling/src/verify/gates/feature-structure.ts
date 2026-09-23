// Gate: feature-structure (core/Core-0-Architecture-and-Structure.md §7) — every domain feature follows the
// per-feature template (index.ts / service.ts / context.ts / contract/ / verbs/). persistence/ and
// substrate/ are per-feature (export has no persistence/; chat/workloads have no substrate/), so they are
// NOT required here. ResourceHost derives the live `packages/server/src/domain` tree; a missing/loose entry
// is a structural fact, not a syntax one.
//
// Documented exceptions to "only index/service/context at root":
// - `guard.ts` is a ratified, cross-domain 9th slot (the committed identity decisions —
//   the `can()` authority seam: `requireAdmin` lives in `domain/admin/guard.ts`). It's an I/O-touching,
//   non-verb gate primitive — can't live in zero-I/O `substrate/`, isn't a verb. Allowed at ANY domain root.
// - `workload-contributions.ts` is the ratified, cross-domain 10th slot (the workloads junk-drawer exit):
//   the domain's OWN background-work contributions, compose-built over its own verbs. Same shape of
//   exception as guard.ts — I/O-touching, not a verb, and cross-domain by construction.
// - `teaching-contribution.ts` is the ratified, cross-domain 11th slot (the S2 model-teaching seam):
//   the domain's OWN contributions to "what this chat's model is told it can do", compose-built over its
//   own verbs and assembled into `ChatContext.teaching` at `entry/compose`. Same shape of exception as
//   `workload-contributions.ts` — I/O-touching, not a verb, cross-domain by construction.
// - A handful of domain-specific root singletons, each individually justified inline below
//   (`DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES`) but not yet promoted to the cross-domain ledger.
//
// WHERE A BROKEN RESOURCE REFUSES — not here (mirrors `server-layout.ts`'s header). A declared resource
// that comes back missing/empty/unresolved/malformed makes `resolveResourceDeclarations`
// (`lib/resource-declaration.ts:182`) THROW during the POPULATION phase, and the receipt phase withholds
// every consumer, both before `create`/`evaluate` run (guide §3's acquisition-refusal rule). This module owns no not-ready
// branch: it reads the domain tree through `readyResourceValue`, whose throw is an assertion that the
// runtime's own refusal already held.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `feature-structure` descriptor at 7b739d9b5cd5ed752f6c38065dfa34e242695d48, the parent of the conversion
// `941d730cc` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,354 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness
// — no `scanRoot` — dispatched 7,354, and the final `population` admits 0; the subject is the declared
// `server-domain` tree. legacy − final = all 7,354 harness candidates — dispatched to the legacy `run`, which read
// none of them (its subject came off disk through `readdirSync`/`existsSync`/`statSync` over
// `packages/server/src/domain`); retired with that read. final − legacy = ∅. Controls: the legacy side is non-empty
// and the final side is empty by declaration, so equality cannot pass vacuously; outside
// `docs/__cbbhr_out_control.ts` rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
//
// FAMILY: a declared SINGLETON under its own id. It judges the server per-feature 8-slot template off the
// `server-domain` tree and consumes no `lib/` reader beyond the resource-consumption primitive `readyResourceValue`;
// `server-layout` judges the server ROOT vocabulary, a different subject, through its own tree read.
import { defineGate } from "../contract/policy.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const DOMAIN_REL = "packages/server/src/domain";
const REQUIRED_FILES = ["index.ts", "service.ts", "context.ts"] as const;
const REQUIRED_DIRS = ["contract", "verbs"] as const;

/** Cross-domain ratified root slots, allowed at ANY domain root:
 *  - `guard.ts` — the ratified `can()` authority-seam pattern
 *    (`Spine-Identity-and-Auth.md`).
 *  - `teaching-contribution.ts` — the ONE home of a domain's S2 MODEL-TEACHING contributions (the
 *    teaching seam's exit: domains DECLARE what the model is told it can do + which registry tools attach,
 *    one chat-side collector folds them onto the single injection channel). A compose-built factory over
 *    the domain's OWN ops, so it can't live in zero-I/O `substrate/` and it isn't a verb; naming it as a
 *    cross-domain slot is what keeps "where does this domain teach the model?" answerable without reading
 *    the turn path. Chat occupies it with contributor #0 (the rpg-gather projection).
 *  - `workload-contributions.ts` — the ONE home of a domain's background-work contributions (the
 *    workloads junk-drawer exit: domains raise seams, the worker skims them). A compose-built factory
 *    over the domain's OWN verbs, so it can't live in zero-I/O `substrate/` and it isn't a verb; naming
 *    it as a cross-domain slot is what makes "where does this domain's queued work live?" answerable
 *    without reading the queue. */
const ALWAYS_ALLOWED_ROOT_FILES = ["guard.ts", "teaching-contribution.ts", "workload-contributions.ts"] as const;

/** Real-tree anchor (tooling/src/verify/gates/GATE-AUTHORING.md §4.5): a domain every real run has and no example builds. The
 *  stale-arm findings anchor HERE (a ResourceHost resource can only ever be declared over the domain
 *  tree it already reads — a second `authored-tree` request for the gate's own source would have to
 *  resolve "ready" on EVERY proof, including the ones that plant no `tooling/` tree at all). */
const ANCHOR_DOMAIN = "chat";
const STALE_ALWAYS =
  "stale ALWAYS_ALLOWED_ROOT_FILES slot — NO domain root carries this file any more, so the cross-domain " +
  "slot is a name the template permits and nothing occupies (ratchet down): the next file to take that name " +
  "inherits a root-slot exemption nobody granted it. Delete the entry: ";
const STALE_DOMAIN_MISSING = "stale DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES row — no such domain under packages/server/src/domain (ratchet down): ";
const STALE_DOMAIN_FILE =
  "stale DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES row — the domain no longer has this root file, so the " +
  "individually-justified singleton is a standing permission on a NAME (ratchet down): ";

/** Domain-specific root singletons — each justified here, since this allowlist IS the source of truth:
 *  - chat: `bus.ts` (chat bus emitter + replay ring), `active-turns.ts` (in-memory controller Set) —
 *    neither fits verbs/substrate/a subsystem.
 *  - preset: `constants.ts` (SYSTEM_DEFAULT_PRESET_ID, domain-internal), `seed.ts` (boot-time
 *    ensureSystemDefaultPreset — too small to be its own subsystem).
 *  - settings: `constants.ts` (the theme seed sentinel TypeIDs, domain-internal), `seed-themes.ts`
 *    (boot-time `ensureSeedThemes` — the preset `seed.ts` precedent, named `-themes` since the domain
 *    root's `seed.ts` slot may host a different concern later).
 *  - rpg: `bus.ts`, `staging.ts`, `snapshot-edit.ts`, `flush-barrier.ts`, `game-mint.ts`, `trace.ts` —
 *    the per-CHAT SSE bus, the Option-A per-turn tool-write staging singleton, the hand-edit I/O seam,
 *    the lite-game birth mechanism, the in-flight-flush barrier, and the R-OBS flight recorder
 *    (rpg-design/05, /10).
 *  - stats: `reconcile-in-flight.ts` (the per-USER single-flight gate for the awaited `stats.reconcile`
 *    verb, owner ruling 2026-08-02). */
const DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES: Readonly<Record<string, readonly string[]>> = {
  chat: ["bus.ts", "active-turns.ts"],
  rpg: ["bus.ts", "staging.ts", "snapshot-edit.ts", "flush-barrier.ts", "game-mint.ts", "trace.ts"],
  preset: ["constants.ts", "seed.ts"],
  settings: ["constants.ts", "seed-themes.ts"],
  stats: ["reconcile-in-flight.ts"],
};

function isAllowedRootFile(feature: string, fileName: string): boolean {
  const allNames: readonly string[] = REQUIRED_FILES;
  if (allNames.includes(fileName) || (ALWAYS_ALLOWED_ROOT_FILES as readonly string[]).includes(fileName)) {
    return true;
  }
  return (DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES[feature] ?? []).includes(fileName);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Every DIRECT child entry of `dir`, at any kind. */
function directChildren(entries: readonly ResourceTreeEntry[], dir: string): readonly ResourceTreeEntry[] {
  const prefix = `${dir}/`;
  return entries.filter((entry) => entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes("/"));
}

/** The domain-root feature names: depth-1 DIRECTORY entries under `packages/server/src/domain`. */
function featureNames(entries: readonly ResourceTreeEntry[]): readonly string[] {
  return directChildren(entries, DOMAIN_REL)
    .filter((entry) => entry.kind === "directory")
    .map((entry) => basename(entry.path))
    .toSorted();
}

function hasEntry(byPath: ReadonlyMap<string, ResourceTreeEntry>, path: string, kind: ResourceTreeEntry["kind"]): boolean {
  return byPath.get(path)?.kind === kind;
}

interface Report {
  readonly path: string;
  readonly message: string;
}

function checkRequiredSlots(byPath: ReadonlyMap<string, ResourceTreeEntry>, feature: string, featureDir: string, out: Report[]): void {
  for (const file of REQUIRED_FILES) {
    if (!hasEntry(byPath, `${featureDir}/${file}`, "file")) {
      out.push({
        path: featureDir,
        message: `missing template file '${file}' (8-slot per-feature template, Core-0-Architecture-and-Structure.md §4) at ${DOMAIN_REL}/${feature}/`,
      });
    }
  }
  for (const dir of REQUIRED_DIRS) {
    if (!hasEntry(byPath, `${featureDir}/${dir}`, "directory")) {
      out.push({
        path: featureDir,
        message: `missing template dir '${dir}/' (8-slot per-feature template, Core-0-Architecture-and-Structure.md §4) at ${DOMAIN_REL}/${feature}/`,
      });
    }
  }
}

function checkLooseFiles(entries: readonly ResourceTreeEntry[], feature: string, featureDir: string, out: Report[]): void {
  for (const entry of directChildren(entries, featureDir)) {
    if (entry.kind === "file" && !isAllowedRootFile(feature, basename(entry.path))) {
      out.push({
        path: entry.path,
        message: `loose file '${basename(entry.path)}' not allowed at feature root (must be index.ts, service.ts, context.ts, guard.ts, or a domain-specific documented root file — Core-0-Architecture-and-Structure.md §4)`,
      });
    }
  }
}

/** TWO-SIDED (tooling/src/verify/gates/GATE-AUTHORING.md §4.4): both root-slot allowlists ratchet DOWN. Guarded on a REAL-TREE
 *  ANCHOR (§4.5): a domain every real run has and no example builds. */
function staleRootSlotRows(entries: readonly ResourceTreeEntry[], byPath: ReadonlyMap<string, ResourceTreeEntry>): readonly Report[] {
  if (!hasEntry(byPath, `${DOMAIN_REL}/${ANCHOR_DOMAIN}`, "directory")) {
    return []; // synthetic fixture — these are whole-tree claims
  }
  const domains = featureNames(entries);
  const out: Report[] = [];
  const row = (message: string): Report => ({ path: `${DOMAIN_REL}/${ANCHOR_DOMAIN}`, message });
  for (const slot of ALWAYS_ALLOWED_ROOT_FILES) {
    if (!domains.some((domain) => hasEntry(byPath, `${DOMAIN_REL}/${domain}/${slot}`, "file"))) {
      out.push(row(`${STALE_ALWAYS}"${slot}" — the slot list lives in tooling/src/verify/gates/feature-structure.ts`));
    }
  }
  for (const [domain, files] of Object.entries(DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES)) {
    if (!domains.includes(domain)) {
      out.push(row(`${STALE_DOMAIN_MISSING}"${domain}" — delete the row in tooling/src/verify/gates/feature-structure.ts`));
      continue;
    }
    for (const file of files) {
      if (!hasEntry(byPath, `${DOMAIN_REL}/${domain}/${file}`, "file")) {
        out.push(row(`${STALE_DOMAIN_FILE}"${domain}/${file}" — delete the entry in tooling/src/verify/gates/feature-structure.ts`));
      }
    }
  }
  return out;
}

export const gate = defineGate({
  id: "feature-structure",
  family: "feature-structure",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the per-feature domain layout is a closed ResourceHost tree fact" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-tree", id: "server-domain" }],
  message:
    "a domain feature does not follow the per-feature template — it is missing a required slot (index.ts / service.ts / context.ts / contract/ / verbs/) or carries a loose non-template file at its root (Core-0-Architecture-and-Structure.md §4).",
  fix: "add the missing template slot, or move the loose file into verbs/ / substrate/ / a subsystem (only index/service/context/guard + documented singletons live at the feature root).",
  create: (ctx) => ({
    evaluate: () => {
      const entries = readyResourceValue(ctx.resources.authoredTree("server-domain"));
      const byPath = new Map(entries.map((entry) => [entry.path, entry]));
      const findings: Report[] = [];
      for (const feature of featureNames(entries)) {
        const featureDir = `${DOMAIN_REL}/${feature}`;
        checkRequiredSlots(byPath, feature, featureDir, findings);
        checkLooseFiles(entries, feature, featureDir, findings);
      }
      for (const finding of findings) {
        ctx.report.file(finding.path, { line: 1, column: 1, message: finding.message });
      }
      for (const stale of staleRootSlotRows(entries, byPath)) {
        ctx.report.file(stale.path, { line: 1, column: 1, message: stale.message });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { "packages/server/src/domain/broken/index.ts": "export const x = 1;\n" },
      expect: { count: 4, messageIncludes: "missing template" },
      why: "a domain feature with only index.ts — missing service.ts/context.ts/contract/verbs (§4)",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/loose/index.ts": "export const x = 1;\n",
        "packages/server/src/domain/loose/service.ts": "export const s = 1;\n",
        "packages/server/src/domain/loose/context.ts": "export const c = 1;\n",
        "packages/server/src/domain/loose/contract/service.ts": "export const cs = 1;\n",
        "packages/server/src/domain/loose/verbs/x.ts": "export const v = 1;\n",
        // all required slots present, but a non-template file sits at the feature root.
        "packages/server/src/domain/loose/helpers.ts": "export const h = 1;\n",
      },
      expect: { count: 1, messageIncludes: "loose file 'helpers.ts' not allowed" },
      why: "a feature with every required slot PLUS a loose non-template root file — the checkLooseFiles arm",
    },
    {
      mode: "resource",
      files: {
        // The anchor domain exists (so the stale arms judge) and carries one of its two documented
        // singletons; every other allowlisted slot/row names something this tree does not have.
        "packages/server/src/domain/chat/index.ts": "export const x = 1;\n",
        "packages/server/src/domain/chat/service.ts": "export const s = 1;\n",
        "packages/server/src/domain/chat/context.ts": "export const c = 1;\n",
        "packages/server/src/domain/chat/contract/service.ts": "export const cs = 1;\n",
        "packages/server/src/domain/chat/verbs/x.ts": "export const v = 1;\n",
        "packages/server/src/domain/chat/guard.ts": "export const g = 1;\n",
        "packages/server/src/domain/chat/bus.ts": "export const b = 1;\n",
      },
      expect: { count: 7, messageIncludes: "stale ALWAYS_ALLOWED_ROOT_FILES slot" },
      why: "THE STALE ARMS: with the anchor domain present, `guard.ts` and chat's `bus.ts` are occupied and stay — `workload-contributions.ts` (no domain has it), the missing per-domain rows, and chat's absent `active-turns.ts` each ratchet down as permissions on a name nothing occupies",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/whole/index.ts": "export const x = 1;\n",
        "packages/server/src/domain/whole/service.ts": "export const s = 1;\n",
        "packages/server/src/domain/whole/context.ts": "export const c = 1;\n",
        "packages/server/src/domain/whole/contract/service.ts": "export const cs = 1;\n",
        "packages/server/src/domain/whole/verbs/x.ts": "export const v = 1;\n",
      },
      why: "a feature with all required slots (index/service/context + contract/ + verbs/) — the template, passes; with no anchor domain this is not the real tree, so the stale arms stay silent (THE ANCHOR GUARD)",
    },
  ],
});
