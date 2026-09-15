// Policy: policy-legacy-imports — a FINAL module's IMPORT DOORS are judged by where they RESOLVE (#2111, #2096;
// family `policy-soundness`, readers `lib/policy-descriptor-read.ts` for both registrations and
// `lib/gate-contract-origin.ts`'s import-origin discipline for the identity). Two ORIGIN arms and one
// RECEIPT arm, one visitor:
//
//   A the legacy descriptor contract, the central authority machinery, or an ENTRYPOINT VERB under `ops/**`
//     (#2186 — the one DIRECTORY-CLASS member, judged by prefix) — reached DIRECTLY or through a RE-EXPORT
//     SHIM (#2201; §12.5: *"gate modules receive neither
//     grant tables nor marker parsers"*; §3's non-negotiables: no gate-owned exemption table; §12.8: zero
//     `ExemptionRow` tables, no private runtime). NOTHING held any of it for a final module until this policy:
//     `gate-modernization` ARM B judges only whether an exemption table carries a STALE arm (the legacy law), and
//     the loader validates the descriptor OBJECT, which cannot see an import. Measured 2026-09-12 across the 246
//     final modules: NINE import `contract/gate.ts` (`ExemptionTable` ×8, `ExemptionRow` ×2, `Finding` ×2), every
//     one a legacy exemption artifact carried across its conversion — the #1922 authority migration's exact work
//     list (row #2147); THREE more import the central marker engine for a coordinate helper (#2155). All twelve are
//     RED on the real tree by design (owner ruling 2026-09-12: the red is the finding).
//     THE LIST IS BEING BURNED DOWN, and the 2026-09-12 measurement above is kept verbatim as the mint's record.
//     Re-measured 2026-09-14 (#2176 Phase F): the whole policy reports EIGHT, of which SEVEN are this burn-down and
//     one is ARM B's (`query-freshness-coverage-debt` importing its sibling, a pre-existing red outside Phase F).
//     `lib/raw-spacing-tier.ts` and `lib/raw-typography-tier.ts` then left the list — NOT by relocating a table, but
//     because a cp-probe proved the rows are SCAN-SCOPE rather than exemptions (both tables emptied → all four
//     consumers still ZERO findings, so nothing was being forgiven and a reviewed grant could not be consumed even
//     once). They now carry `contract/tier-home.ts#TierImplementationHomes`, which is the classification
//     `gate-modernization` ARM B's own `fix` prescribes — *"if the collection is a scan-SCOPE decision rather than an
//     exemption, rename it out of the exemption vocabulary"* — and NOT the relocation ARM D's `fix` refuses.
//   B ANOTHER GATE MODULE (§12.3, owner ruling #2096, 2026-09-12: *"a gate module never imports another gate
//     module; shared predicates move to `lib/<family>.ts`"*). A `-health` sibling reading its twin's exports was
//     two homes for one reader wearing a family's clothes. The predicate is NOT the directory: `gates/_proof/**`
//     holds shared proof surfaces that register nothing (`persist-partialize-and-total-migrate` imports
//     `./_proof/zustand.ts` by right, guide §6.5), so the arm resolves the specifier and asks the loader's own
//     question of the TARGET — does it register under either contract (`gateRegistrationOf`)? A module that does
//     is a gate module wherever it sits; a module that does not is a surface, a reader or a helper.
//   D the RECEIPT arm (#2320, 2026-09-13): a BINDING this module imports whose declared DATA GRAPH carries
//     `contract/gate.ts`'s `ExemptionTable`/`ExemptionRow` — wherever that declaration sits. ARM A judges
//     where a specifier RESOLVES, so moving a gate-owned table ONE HOP into `lib/` took four of the nine
//     modules named at mint to green with the substance intact and zero reviewed grants minted, and this
//     module's own `fix` text authorized the move. §12.5's property is RECEIPT — *"gate modules receive
//     neither grant tables nor marker parsers"* — so the finding belongs at the RECEIVING door, not at the
//     declaration: `lib/grant-liveness.ts` and `lib/sanctioned-home.ts` type FUNCTION PARAMETERS with
//     `ExemptionTable` and hold no rows, and both are imported by converted exemplars (`biome-grant-liveness`,
//     `tsconfig-entry-liveness`) — an arm keyed on the DECLARATION SITE would red the program's own migration
//     shape. Identity is the RESOLVED declaration of the type name, never its spelling.
//     **THE DECLARED LIMIT, and it is a LIMIT, not a gap that was overlooked.** ARM D is a TYPE-IDENTITY arm.
//     A module that declares its OWN row interface locally and keeps the same per-subject table is INVISIBLE
//     to it — the live example is `lib/injected-op-caller-param.ts#CallerFreeOpRow`, RETYPED rather than
//     relocated, which appears in neither `ast refs ExemptionTable` nor this arm and carries a `mustPass` row
//     saying so. The constructions attempted and REJECTED: a shape arm on `Record<string, { why }>` reds
//     `contract/tenancy-scope.ts#ScopingRow`, `lib/registry-triggers.ts#StageTrigger` and every honest cited
//     vocabulary; a use-provenance arm ("a module-level per-subject collection consulted to SKIP a report")
//     needs the membership test to reach the ABSENCE of a `ctx.report.*` call, which is control flow, and it
//     would red THIS module's own `FORBIDDEN_BASENAMES.has(...)`. The retype class remains the #1922 migration
//     and per-module review's obligation; this reader cannot certify that work. The shared query uses the
//     checker's declared data types: roots, unions/intersections, array/tuple/index elements and named
//     properties. Ordinary objects, interfaces and mappings follow the SAME property edges; compiler
//     construction flags cannot establish collection intent. Optional/empty carriers are still typed to
//     carry the canonical data: the finding proves neither present runtime rows nor suppression use.
//     Authored references retain alias names only when their types occur in those data positions. A keyof
//     operand, erased argument or callable parameter/result is not data containment. Canonical opaque or
//     identity-losing projections REFUSE; foreign provenance stays foreign. Earlier closure claims were
//     refuted by aliases, syntax-only accusations and inconsistent wrapper semantics. Structural retypes,
//     inferred initializer identity and compiler validity remain outside this arm.
//     THE CUTOVER LANDED AND THE TYPE SURVIVED IT (#2176 Phase F, 2026-09-14). `contract/gate.ts` kept
//     `ExemptionTable`/`ExemptionRow`/`Finding` and lost its descriptor half, precisely because moving those
//     three declarations would have retired THIS ARM'S real-tree subject rather than the class it names —
//     a relocation is not a discharge, which is the same sentence the `fix` makes about a table. The limit
//     above is unchanged: a module that declares its OWN row interface is still invisible here.
//
// THE CANDIDATE SETS, per arm, with the `lib/origin-verdict.ts` discipline (identity, not spelling; fail closed
// only inside the candidate set):
//   A a specifier whose BASENAME is a forbidden home's — the identity is the RESOLVED path's suffix in
//     `FORBIDDEN_IMPORT_HOMES`: `contract/gate.ts` (`ExemptionTable`, `ExemptionRow`, `Finding` — its legacy
//     descriptor half was deleted at #2176 Phase F and the three surviving shapes are exactly what §12.5 says a
//     gate module may not receive), `lib/pass.ts` (the legacy dispatcher — the MODULE is now DELETED; the row
//     stays as a resurrection tripwire, see the tuple), `lib/gate-ignore.ts` (the `@orb-gate-ignore` recognizer,
//     §7 kind 1), `lib/reviewed-grants.ts` (the grant table), `lib/ordinary-waiver.ts`
//     (the central `@orb-waive` engine), `lib/gate-authority.ts` (the coordinator), `lib/policy-pass.ts` (the final
//     dispatcher — a pass inside a pass is a private workspace cache, §12.3), `lib/loader.ts` · `lib/policy-loader.ts`
//     (the registry — a module that loads the corpus judges itself). A same-basename module elsewhere
//     (`gates/pass.ts` beside the module) is acquitted by its resolved path.
//   B a RELATIVE specifier (`./…`, `../…`) — a package door cannot name a gate module. The identity is the target's
//     registration. An `export … from` re-export is an import in effect and is judged the same way; a type-only
//     import is coupling all the same (a type has ONE home, `contract/` or `lib/`, never a sibling gate).
//   C a specifier carrying the `ops/` SEGMENT (#2186) — the directory-class member, judged by the resolved path's
//     prefix rather than an exact suffix, and admitting a package-door spelling no basename test could see.
//   The three sets OVERLAP by construction and are tested as a union: `../lib/pass.ts` is A and B at once, and
//   `../ops/debt.ts` is B and C. A specifier in NONE of them is never JUDGED BY THESE THREE, which is what
//   keeps `react` and `ts-morph` out of the accusation (ARM D resolves such a door and drops it at the
//   `tooling/src/` fence below) — but a `../lib/` reader IS a candidate (it is relative), IS
//   resolved, and is acquitted by its TARGET: it names no forbidden home, sits under no forbidden prefix, and
//   registers no gate. Acquittal by identity, never by never being looked at.
//   D NO SPELLING CANDIDACY AT ALL — ARM D asks its question of EVERY door whose target resolves INSIDE
//     `tooling/src/` (the fence that keeps `ts-morph`'s declaration surface out of an export-map read), and
//     it asks it of every binding the door receives: a named import (by its name IN THE TARGET, so
//     `{ X as Y }` is judged as `X`), a default import, and a namespace import or `export *`, which receive
//     the WHOLE export surface and are judged over every export. A named or default binding is resolved by
//     the SHARED reader (`_shared/reference-fact.ts#resolveModuleMemberOrigin`, #2097 — a gate resolves no
//     binding of its own), which follows RE-EXPORT CHAINS, so a two-hop shim is the same finding as a direct
//     import and needs no walk here; the two forms the reader answers `unsupported` for (a `NamespaceImport`
//     and an `ExportSpecifier`) and the `ExportAssignment` it stops at are read off the TARGET'S OWN EXPORT
//     MAP instead, a reader gap recorded at `enumeratedValues`. A door whose target does not resolve is ARM A/B's
//     `unreadable` when it is a candidate of theirs and is otherwise not accused (#2185: outside a candidate
//     set unreadability is ordinary) — the stated coverage limit. But a RESOLVED target that does not export
//     a binding this module names REFUSES the run (`BINDING UNREADABLE`): the declaration cannot be read, and
//     acquitting a binding nobody could read is the fail-open this arm exists to prevent.
//   Every candidate is resolved AGAIN one hop in (#2201): a shim's own `export … from` declarations are asked the
//   same question, to fixpoint over a visited set, so a one-hop `lib/` re-export cannot launder a forbidden home
//   past both arms. A candidate that resolves to NOTHING — at the door or anywhere in the chain — is reported
//   under the disjoint UNREADABLE text rather than acquitted on its spelling (#944 fail-closed).
//
// WHAT THIS IS NOT. `../contract/policy.ts`, `../contract/fact.ts` and every other `contract/*` are the FINAL
// contract and its type homes — imported by every policy. `lib/gate-contract.ts`, `lib/gate-contract-origin.ts`
// and `lib/policy-descriptor-read.ts` are the shared readers the family itself consumes. The EXACT home list is
// closed on purpose. A DIRECTORY-CLASS member was ruled a contract edit with a named consumer rather than a
// widening of that list, and #2186 is that edit landing: `ops/**` joined as a PREFIX member with its own verdict
// kind and its own rows (see `FORBIDDEN_IMPORT_PREFIXES`), still measured at zero consumers when it landed
// (1522 import declarations across 303 gate modules, none naming `ops/`). And a top-level `gates/*.ts` module that registers NOTHING is
// `gate-modernization` ARM A's finding (UNREGISTERED), not this policy's: importing it is not importing a gate.
//
// BLINDNESS: this module sits inside its own population, so when it is delivered and does not read as final the
// import-origin recognizer is dead and the run THROWS rather than reporting ✓ over the corpus forever (the
// family's tripwire, pinned by a `mustRefuse` row and through `runPolicyPass` in the family test).
// `hard`/`error`: an enforcer a gate module could waive out of would be the door §12.5 closed, reopened.
//
// FAMILY `policy-soundness` — the shared reader is `lib/policy-descriptor-read.ts` (`finalRegistrationOf` /
// `gateRegistrationOf` for the contract kind, so "is this module final" is answered by IMPORT ORIGIN in one
// place rather than by each member's own idea of the word). Nine modules declare this family; that reader's
// own header still says four, which was true when it was written.
// POPULATION PORT: NONE — there is no legacy population to port, because this module was BORN FINAL. It
// first appears at `b2c6a8553` already carrying `defineGate`, and `git show b2c6a8553^:<this file>` refuses
// with "exists on disk, but not in b2c6a8553^". That refusal IS the receipt (the `scrubber-factory-home`
// precedent); an invented pre-conversion sha would be worse than the absence. The population
// `{ in: ["@tooling"], under: ["tooling/src/verify/gates/**"], notUnder: [".../_proof/**"] }` was therefore
// authored, not derived: the `_proof/` exclusion is a fixture fence, not a translated legacy predicate.
import type { ExportDeclaration, ImportDeclaration, SourceFile, Node as TsNode, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import type { ModuleMemberOrigin, ReferenceFact } from "../../_shared/reference-fact-contract.ts";
import type { GateContractKind } from "../contract/gate-corpus.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { TypeIdentityOrigin } from "../contract/type-member-origin.ts";
import { classifyOriginRefusal, referenceNamesExport } from "../lib/origin-verdict.ts";
import { finalRegistrationOf, gateRegistrationOf } from "../lib/policy-descriptor-read.ts";
import { resolveTypeValueOrigins } from "../lib/type-member-origin.ts";
import { familyFixture, finalProbeModule, HARD_TRUNK } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-legacy-imports.ts";

/** ARM A's closed set, as REPO-RELATIVE suffixes the resolved path is judged by. Each member has its own row.
 *
 *  A MEMBER WHOSE MODULE NO LONGER EXISTS STAYS IN THE TUPLE (#2176 Phase F, 2026-09-14). `lib/pass.ts` was
 *  deleted with the legacy dispatcher; its entry is not residue but a RESURRECTION TRIPWIRE — the day anyone
 *  re-creates a module at that path, a gate importing it is RED on the first run rather than after somebody
 *  notices. It costs one string and its own fixture-planted row (which never depended on the real file: every
 *  ARM A row plants its target through `TARGET(…)`, so the proofs are unaffected by the deletion). The same
 *  reasoning is why an entry is never removed merely because today's corpus has no importer of it. */
const FORBIDDEN_IMPORT_HOMES = [
  "/tooling/src/verify/contract/gate.ts",
  "/tooling/src/verify/lib/pass.ts",
  "/tooling/src/verify/lib/gate-ignore.ts",
  "/tooling/src/verify/lib/reviewed-grants.ts",
  "/tooling/src/verify/lib/ordinary-waiver.ts",
  "/tooling/src/verify/lib/gate-authority.ts",
  "/tooling/src/verify/lib/policy-pass.ts",
  "/tooling/src/verify/lib/loader.ts",
  "/tooling/src/verify/lib/policy-loader.ts",
] as const;
const FORBIDDEN_BASENAMES: ReadonlySet<string> = new Set(FORBIDDEN_IMPORT_HOMES.map((home) => home.slice(home.lastIndexOf("/") + 1)));

/** THE CANDIDACY TESTS — ONE HOME, because #2201 asks the SAME question at every hop of a re-export chain that
 *  `judgeDoor` asks at the door. A second spelling of "is this worth resolving" is a second rule that can drift
 *  from the one it mirrors, and the drift would be invisible: it would show up only as a shim nobody resolved. */
function isHomeCandidate(specifier: string): boolean {
  return FORBIDDEN_BASENAMES.has(basenameOf(specifier));
}
/** A package door cannot name a gate module, so only a relative specifier can be ARM B's subject. */
function isSiblingCandidate(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}
/** The prefix member's candidacy is the SEGMENT, not a basename: `ops/` names a directory, so any specifier that
 *  traverses it is asked the question. A relative one is already a candidate through ARM B; this admits a
 *  package-door spelling (`@orb/tooling/verify/ops/x`) as well, which no exact-home test could see. */
function isPrefixCandidate(specifier: string): boolean {
  return specifier.includes("ops/");
}
function isCandidateSpecifier(specifier: string): boolean {
  return isHomeCandidate(specifier) || isSiblingCandidate(specifier) || isPrefixCandidate(specifier);
}
const TOOLING_SRC = "/tooling/src/";

/** ARM A's DIRECTORY-CLASS member (#2186, matrix C10) — the one home judged by a PREFIX rather than an exact
 *  path, and the reason it may be a prefix is a property of the directory, not a convenience:
 *
 *  `ops/**` holds ENTRYPOINT VERB IMPLEMENTATIONS — the bodies `cli.ts` dispatches to, one per `verify` verb.
 *  Nothing under it is a shared reader; every shared reader in this system lives in `lib/`, which is where the
 *  family's own recognisers are imported from. So there is NO legitimate import of an `ops/` module from a gate
 *  module, and a prefix cannot over-reach the way `gates/**` would (that directory holds `_proof/` surfaces
 *  imported by right, which is exactly why ARM B resolves REGISTRATION instead of testing a directory).
 *  Measured 2026-09-12 before landing: 1522 import declarations across 303 gate modules, ZERO naming `ops/`.
 *
 *  The rule it enforces is §12.3's: a gate is not an entrypoint. A module that reaches a verb implementation is
 *  running the tool rather than describing a property of the tree — and it would drag that verb's whole
 *  transitive surface (a run slot, an artifact writer, a process exit contract) behind a detector. */
const FORBIDDEN_IMPORT_PREFIXES = ["/tooling/src/verify/ops/"] as const;

const MESSAGE =
  "a FINAL policy module imports the shared exemption vocabulary or the central authority machinery (gate-runtime-standardization.md §5, §9): " +
  "`contract/gate.ts` (ExemptionTable/ExemptionRow/Finding), the retired dispatcher or marker recognizer, the grant table, the waiver " +
  "engine, the coordinator, the final dispatcher or the loader. A gate module receives neither grant tables nor marker parsers, owns no " +
  "exemption table, and runs no pass of its own; a legacy artifact carried across a conversion is the #1922 migration's work, never a keep. " +
  "The `from` token names the import; the message names the resolved home.";
const PREFIX_MESSAGE =
  "a FINAL policy module imports an ENTRYPOINT VERB IMPLEMENTATION under `tooling/src/verify/ops/**` " +
  "(gate-runtime-standardization.md §3: a gate is not an entrypoint). `ops/` holds the bodies `cli.ts` dispatches to, one per verb; " +
  "every SHARED reader lives in `lib/`, so no gate has a legitimate door here. A detector that reaches a verb implementation is running " +
  "the tool rather than describing a property of the tree, and it drags that verb's whole surface — a run slot, an artifact writer, an " +
  "exit contract — behind itself. The `from` token names the import; the message names the resolved target and the forbidden directory.";
const LAUNDERED_MESSAGE =
  "a FINAL policy module reaches the legacy contract or the central machinery THROUGH A RE-EXPORT SHIM (#2201; gate-runtime-standardization.md §5, §9). " +
  "The door itself resolves to an innocent module, but that module re-exports a forbidden home, so this gate receives the forbidden surface one hop removed. " +
  "#2096 took direct gate-to-gate imports to zero; a one-hop `lib/` shim is the path of least resistance that reopens it, and closing this is what makes #2096 " +
  "stay closed. REPAIR EITHER END: if the import is legitimate the SHIM is the defect (a `lib/` reader re-exporting the legacy contract is two homes for one " +
  "vocabulary); if the shim is legitimate this gate must stop reaching through it. The message names both ends of the chain.";
const SIBLING_MESSAGE =
  "a FINAL policy module imports ANOTHER GATE MODULE (gate-runtime-standardization.md §3, owner ruling #2096): a gate module never imports a gate " +
  "module. A split family's shared predicate lives in `lib/<family>.ts` and BOTH siblings import it from there; a sibling reading its twin's " +
  "exports is two homes for one reader. The target is judged by REGISTRATION, never by directory — a shared proof surface under `gates/_proof/` " +
  "registers nothing and is not this finding. The `from` token names the import; the message names the target and its contract.";
const UNREADABLE_MESSAGE =
  "a FINAL policy module imports a candidate specifier that resolves to NOTHING — a basename in the forbidden-home set (`gate.ts`, `pass.ts` (a DELETED module kept as a tripwire), " +
  "`gate-ignore.ts`, `reviewed-grants.ts`, `ordinary-waiver.ts`, `gate-authority.ts`, `policy-pass.ts`, `loader.ts`, `policy-loader.ts`) or a " +
  "relative path that could name a sibling gate module. The import origin CANNOT be established, so the module is reported rather than " +
  "acquitted on the strength of a spelling (#944 fail-closed).";
const EXEMPTION_VALUE_MESSAGE =
  "a FINAL policy module receives a binding typed to carry canonical exemption data through an import door (#2320): " +
  "its declared data graph reaches `contract/gate.ts`'s `ExemptionTable`/`ExemptionRow`, wherever the binding is declared. " +
  "Roots, union/intersection members, array/tuple/index elements and named data properties follow the same identity rule; " +
  "ordinary, readonly and optional wrappers do not remove that identity. This proves typed containment, not present runtime " +
  "rows or suppression use. Callable parameters/results and structural lookalikes do not establish this data receipt. " +
  "A gate receives neither grant tables nor marker parsers (gate-runtime-standardization.md §12.5); migrate owned exemptions " +
  "to exact reviewed grants (#1922), rather than relocating them behind another value wrapper. The `from` token names the " +
  "receiving import; the message names the binding, its declaration home and the contained canonical identity.";
const UNREADABLE_BINDING =
  "BINDING UNREADABLE (#2320, #944 fail-closed): a FINAL policy module imports a binding whose declaration or candidate exemption-data type " +
  "cannot be established. A missing exported binding, unreadable canonical type, or unsupported canonical projection is a refusal, " +
  "not proof of an exemption and not a clean verdict. Refusing the run. The unreadable subject is";
const FIX =
  "ARM A: migrate the exemption table to exact reviewed grants (#1922, §12.5), replace a `Finding`-typed helper with `ctx.report.node`/`ctx.report.file`, " +
  "and delete every import of the legacy or central machinery; a final module reads only `contract/*` and the shared `lib/` readers. " +
  "ARM B: move the shared predicate to `lib/<family>.ts` and import it there from BOTH modules (#2096). " +
  "ARM D: RELOCATION IS NOT DISCHARGE (#2320) — a ROW TYPE with one owner may move to `contract/` (the `contract/tenancy-scope.ts#ScopingRow` " +
  "precedent, which is a classification and not an allowance), but a TABLE moves nowhere: `lib/` is a home for READERS, and a table parked there " +
  "is the same gate-owned exemption one hop out. Migrate it to reviewed grants keyed on (subject, operation), or delete it.";
const BLIND =
  `BLINDNESS: ${SELF} is in the effective population and does not read as a final policy — the import-origin recognizer ` +
  "(lib/gate-contract-origin.ts isCanonicalDefineGate) is dead, so every module would read out of scope. Refusing the run.";

/** An `import … from` or an `export … from` — both open a door to another module and both are judged. */
type ModuleDoor = ImportDeclaration | ExportDeclaration;

type DoorVerdict =
  | { readonly kind: "forbidden-home"; readonly home: string }
  /** LAUNDERED (#2201): the door itself resolves to an innocent module, but that module RE-EXPORTS a forbidden
   *  home — so the gate receives the forbidden surface one hop removed. Named separately from `forbidden-home`
   *  because the repair is different: the import may be legitimate and the SHIM is the defect, or the shim may
   *  be legitimate and this gate must stop reaching through it. The message names both ends. */
  | { readonly kind: "laundered"; readonly home: string; readonly shim: string }
  /** The DIRECTORY-CLASS member (#2186): the resolved path lies under a forbidden prefix. A third kind rather
   *  than a tenth `FORBIDDEN_IMPORT_HOMES` entry, because the test is different in kind — `endsWith` an exact
   *  path versus `includes` a directory — and collapsing them would make the home table mean two things. */
  | { readonly kind: "forbidden-prefix"; readonly prefix: string; readonly target: string }
  | { readonly kind: "sibling-gate"; readonly contract: GateContractKind; readonly target: string }
  /** ARM D (#2320): the received binding is typed to carry canonical exemption data. Named separately from `forbidden-home` because the door itself is innocent — the target is
   *  an ordinary `lib/` module — and the repair is the MIGRATION of the table, never the deletion of a
   *  reader import. The message names the binding, its declaration home and which type it resolved to. */
  | { readonly kind: "exemption-value"; readonly binding: string; readonly declaration: string; readonly type: string }
  | { readonly kind: "unreadable" };

function basenameOf(specifier: string): string {
  return specifier.slice(specifier.lastIndexOf("/") + 1);
}

/** The target's path as a reader spells it — repo-relative under `tooling/src/`, else the basename. Never
 *  `ctx.relativePath`, which is partial (it throws for a target outside the effective population). */
function displayPath(absolute: string): string {
  const index = absolute.indexOf(TOOLING_SRC);
  return index === -1 ? basenameOf(absolute) : absolute.slice(index + 1);
}

/** The verdict on one door, or undefined for a door that is not a candidate of either arm or resolves to an
 *  unrelated module. Resolution happens ONLY for a candidate, and a candidate that resolves nowhere fails closed. */
function judgeDoor(door: ModuleDoor): DoorVerdict | undefined {
  const specifier = door.getModuleSpecifierValue();
  if (specifier === undefined) {
    return;
  }
  const homeCandidate = isHomeCandidate(specifier);
  const siblingCandidate = isSiblingCandidate(specifier);
  const target = door.getModuleSpecifierSourceFile();
  if (!isCandidateSpecifier(specifier)) {
    // ARM D has NO spelling candidacy (#2320): a received table is a received table whatever the door is
    // spelled like, so a non-candidate door is still asked — and a non-candidate that resolves nowhere is
    // still never accused, because outside the origin arms' candidate set unreadability is ordinary (#2185).
    return target === undefined ? undefined : exemptionValueDoor(door, target, target.getFilePath().replaceAll("\\", "/"));
  }
  if (target === undefined) {
    return { kind: "unreadable" };
  }
  const path = target.getFilePath().replaceAll("\\", "/");
  const home = homeCandidate ? FORBIDDEN_IMPORT_HOMES.find((candidate) => path.endsWith(candidate)) : undefined;
  if (home !== undefined) {
    return { kind: "forbidden-home", home };
  }
  const prefix = FORBIDDEN_IMPORT_PREFIXES.find((candidate) => path.includes(candidate));
  if (prefix !== undefined) {
    return { kind: "forbidden-prefix", prefix, target: displayPath(path) };
  }
  const contract = siblingCandidate ? gateRegistrationOf(target) : undefined;
  if (contract !== undefined) {
    return { kind: "sibling-gate", contract, target: displayPath(path) };
  }
  // The ORIGIN arms first, then RECEIPT: a door that reaches a forbidden home through a shim is reported as
  // the laundering it is, and only a door innocent of BOTH origins is asked what it receives.
  return launderedThrough(target, new Set()) ?? exemptionValueDoor(door, target, path);
}

/** DOES THIS INNOCENT MODULE RE-EXPORT A FORBIDDEN HOME? (#2201 — the lazy-migration shape #2096 invites.)
 *
 *  #2096 took direct gate→gate imports to zero. The obvious next path of least resistance is a one-hop `lib/`
 *  shim: `lib/whatever.ts` does `export { ExemptionTable } from "../contract/gate.ts"`, a gate imports the shim,
 *  and BOTH arms acquit — the basename is not a forbidden home's, and the shim registers no gate. The gate has
 *  the forbidden surface anyway. Closing this is what makes #2096 STAY closed.
 *
 *  THE CANDIDATE DISCIPLINE IS IDENTICAL AT EVERY HOP, deliberately: a re-export specifier is resolved only if
 *  it is itself a candidate (forbidden basename · `ops/` segment · relative). `export … from "ts-morph"` is
 *  never resolved, exactly as at the top-level door. That is what keeps fail-closed honest here — inside the
 *  candidate set an unresolvable specifier is rare AND suspicious, which is the condition the doctrine attaches
 *  to fail-closed; outside it, unreadability is ordinary and convicting on it would be a false-accusation engine
 *  (the #2185 lesson, one module over).
 *
 *  Bounded by a VISITED SET rather than a depth cap: a two-hop shim is the same laundering with one more file,
 *  and a cap would be a declared limit needing a justification the graph does not support. Measured before
 *  landing: the whole of `verify/lib/` + `verify/contract/` holds TWO `export … from` declarations
 *  (`config-static-read.ts:17`, `policy-conformance.ts:14`) and NEITHER targets a forbidden home — so this
 *  fence lands at zero findings and zero false positives, and its cost is two resolutions. */
function launderedThrough(shim: SourceFile, visited: Set<SourceFile>): DoorVerdict | undefined {
  // ONE TAIL RETURN (the house accumulator idiom, `.claude/rules/gates-and-tooling.md`): `biome`'s
  // `noUselessUndefined` deletes a trailing `return undefined;` and tsc's `noImplicitReturns` then reds the
  // fall-through.
  let found: DoorVerdict | undefined;
  if (!visited.has(shim)) {
    visited.add(shim);
    const shimPath = displayPath(shim.getFilePath().replaceAll("\\", "/"));
    for (const reExport of shim.getExportDeclarations()) {
      found = launderedByReExport(reExport, shimPath, visited);
      if (found !== undefined) {
        break;
      }
    }
  }
  return found;
}

/** ONE re-export declaration of a shim: the forbidden home it reaches, the refusal when its specifier cannot be
 *  resolved, or the deeper chain's verdict. A specifier that is not a CANDIDATE is never resolved at all. */
function launderedByReExport(reExport: ExportDeclaration, shimPath: string, visited: Set<SourceFile>): DoorVerdict | undefined {
  let found: DoorVerdict | undefined;
  const specifier = reExport.getModuleSpecifierValue();
  if (specifier !== undefined && isCandidateSpecifier(specifier)) {
    const target = reExport.getModuleSpecifierSourceFile();
    if (target === undefined) {
      // FAIL-CLOSED inside the candidate set: the chain could end at a forbidden home and nothing can say it
      // does not, so it is reported rather than acquitted on a spelling (#944).
      found = { kind: "unreadable" };
    } else {
      const path = target.getFilePath().replaceAll("\\", "/");
      const home =
        FORBIDDEN_IMPORT_HOMES.find((candidate) => path.endsWith(candidate)) ?? FORBIDDEN_IMPORT_PREFIXES.find((candidate) => path.includes(candidate));
      found = home === undefined ? launderedThrough(target, visited) : { kind: "laundered", home, shim: shimPath };
    }
  }
  return found;
}

/** ARM D's IDENTITY: the canonical exemption vocabulary, as the declaration home its type name must resolve
 *  to plus the two names that home declares. A same-spelled `ExemptionTable` declared anywhere else is a
 *  different type and acquits — the `lib/origin-verdict.ts` discipline applied to a TYPE rather than a door. */
const EXEMPTION_VALUE_HOME = "/tooling/src/verify/contract/gate.ts";
const EXEMPTION_VALUE_TYPES: ReadonlySet<string> = new Set(["ExemptionTable", "ExemptionRow"]);
/** TypeScript's const assertion, which parses as a type reference and declares nothing. */
const CONST_ASSERTION = "const";

/** THE ONE RESOLUTION ROUTE, and it is the SHARED reader, never a local walk (#2097, §12.3: *"gate-local
 *  binding/origin resolution is FORBIDDEN … the sanctioned route is the shared readers"*). A refusal is
 *  classified by the family's own three-answer classifier: a PROVEN non-module binding (a local interface,
 *  a lib.d.ts global) is a different identity and acquits; anything else is UNREADABLE, and an unreadable
 *  subject inside this arm's candidate set REFUSES the run rather than passing on a spelling. */
function moduleOrigin(node: TsNode, subject: string): ModuleMemberOrigin | undefined {
  // ONE TAIL RETURN (the house accumulator idiom): biome's `noUselessUndefined` deletes a trailing
  // `return undefined;` and tsc's `noImplicitReturns` then reds the fall-through.
  let origin: ModuleMemberOrigin | undefined;
  const fact = resolveModuleMemberOrigin(node);
  if (fact.kind === "resolved") {
    origin = fact.value;
  } else if (classifyOriginRefusal(fact.reason, node) === "unreadable") {
    throw new Error(`${UNREADABLE_BINDING} ${subject}: ${fact.reason} — ${fact.detail}`);
  }
  return origin;
}

/** Actual value-type identities, or a candidate whose value identity remains unreadable. A refusal's
 *  declaration trace can establish a canonical or foreign candidate home even when the containing value
 *  cannot be classified (for example Readonly<Row>). An empty trace keeps the existing missing-import
 *  classifier; a known foreign trace must not turn into unreadability merely because its name matches. */
function canonicalExemptionReference(fact: ReferenceFact<TypeIdentityOrigin>): string | undefined {
  let found: string | undefined;
  if (fact.kind === "unresolved") {
    const candidate = [...EXEMPTION_VALUE_TYPES].some((name) => referenceNamesExport(fact.node, name));
    const provenances = fact.trace.declarations.map((declaration) =>
      declaration.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith(EXEMPTION_VALUE_HOME),
    );
    const unreadableCandidate = provenances.length > 0 ? provenances.some(Boolean) : classifyOriginRefusal(fact.reason, fact.node) === "unreadable";
    if (candidate && unreadableCandidate) {
      throw new Error(`${UNREADABLE_BINDING} type name \`${fact.node.getText()}\`: ${fact.reason} — ${fact.detail}`);
    }
  } else if (EXEMPTION_VALUE_TYPES.has(fact.value.name)) {
    const homes = fact.value.declarations.map((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith(EXEMPTION_VALUE_HOME));
    if (homes.some(Boolean) && !homes.every(Boolean)) {
      throw new Error(`${UNREADABLE_BINDING} type name \`${fact.value.node.getText()}\`: ambiguous declaration homes`);
    }
    found = homes.length > 0 && homes.every(Boolean) ? fact.value.name : undefined;
  }
  return found;
}

/** One shared value-type query for annotations and assertions. The checker supplies collection elements
 *  and generic/indexed outputs plus named data properties; aliases retain identity only in that graph. */
function canonicalExemptionInAnnotation(annotation: TypeNode): string | undefined {
  let found: string | undefined;
  for (const reference of resolveTypeValueOrigins(annotation)) {
    found = canonicalExemptionReference(reference);
    if (found !== undefined) {
      break;
    }
  }
  return found;
}

/** THE TYPE A VALUE CARRIES ITSELF — a TOP-LEVEL `as`/`satisfies`, with parentheses transparent, and
 *  nothing deeper. ONE home for the assertion read, because the same question is asked of a variable's
 *  initializer and of a default export's expression, and two spellings of it drift (codex's #2320 review:
 *  the default-export path had no assertion read at all, so a direct typed default was a free relocation).
 *
 *  `x as const` PARSES as a type reference named `const` whose symbol has no declaration anywhere, so an
 *  arm that resolves it refuses the whole run on the corpus's commonest literal shape (measured on the real
 *  tree 2026-09-13 — it is why this guard exists rather than a comment saying it cannot happen). */
function assertedTypeNode(expression: TsNode | undefined): TypeNode | undefined {
  let current = expression;
  while (current !== undefined && Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  const asserted = current !== undefined && (Node.isAsExpression(current) || Node.isSatisfiesExpression(current)) ? current.getTypeNode() : undefined;
  return asserted?.getText() === CONST_ASSERTION ? undefined : asserted;
}

/** THE DECLARATION'S OWN TYPE, and deliberately ONLY that: the annotation, or a top-level `as`/`satisfies`
 *  when the author let the value carry its type instead. Never the initializer's interior — an arrow function
 *  whose PARAMETER is table-typed is the shared-reader shape (`lib/sanctioned-home.ts#sanctionedHome`), which
 *  receives a table rather than being one, and descending into it would red the migration's own exemplars. */
function exemptionTypeOf(declaration: TsNode): string | undefined {
  let found: string | undefined;
  if (Node.isExportAssignment(declaration)) {
    // `export default <expression>` — TWO shapes, and only one of them has a declaration behind it.
    //   (a) `export default ({ … } satisfies ExemptionTable)` — the DEFAULT EXPORT IS THE ASSIGNMENT, and
    //       nothing else declares the value. Landed 2026-09-13 after codex REFUTED the first cut: the
    //       identifier hop below filters every `ExportAssignment` out of the export map and then finds
    //       nothing to inspect, so a direct typed default (and its `as ExemptionTable` twin) relocated a
    //       table past ARM D WITHOUT retyping it — measured 0 findings on the landed arm. The value's own
    //       top-level assertion is read here, through the SAME canonical type resolver: no second
    //       resolver, and no descent into an initializer's interior.
    //   (b) `export default <identifier>` — the shared reader's canonical declaration is the ASSIGNMENT, so
    //       the declaration behind it comes from the same file's export map (measured 2026-09-13; the
    //       reader gap `enumeratedValues` records).
    const asserted = assertedTypeNode(declaration.getExpression());
    found =
      asserted === undefined
        ? (declaration.getSourceFile().getExportedDeclarations().get("default") ?? [])
            .filter((behind) => !Node.isExportAssignment(behind))
            .flatMap((behind) => exemptionTypeOf(behind) ?? [])
            .at(0)
        : canonicalExemptionInAnnotation(asserted);
  }
  if (Node.isVariableDeclaration(declaration)) {
    const annotation = declaration.getTypeNode() ?? assertedTypeNode(declaration.getInitializer());
    found = annotation === undefined ? undefined : canonicalExemptionInAnnotation(annotation);
  }
  return found;
}

/** One value a door receives: the name it carries IN THE TARGET, and the declaration it resolves to. */
interface ReceivedValue {
  readonly binding: string;
  readonly declaration: TsNode;
}

/** THE NAMED AND DEFAULT BINDINGS, each resolved through the SHARED reader from its LOCAL binding node —
 *  `{ X as Y }` is resolved from `Y`, because the local binding is what the reader binds and handing it the
 *  exported name instead walks into the value (measured 2026-09-13: the alias's NAME node comes back
 *  `dynamic: ObjectLiteralExpression has no stable module-member origin`, the caller error
 *  `lib/origin-verdict.ts`'s header warns about one axis over). The reader follows re-export chains, so a
 *  two-hop shim lands on the same declaration and this arm needs no walk of its own. */
function resolvedBindings(door: ImportDeclaration, doorPath: string): readonly ReceivedValue[] {
  const bindings = door.getNamedImports().map((specifier) => ({ name: specifier.getName(), node: specifier.getAliasNode() ?? specifier.getNameNode() }));
  const defaultImport = door.getDefaultImport();
  const all = defaultImport === undefined ? bindings : [...bindings, { name: "default", node: defaultImport }];
  return all.flatMap(({ name, node }) => {
    const origin = moduleOrigin(node, `binding \`${name}\` from ${doorPath}`);
    const canonical = origin?.canonical;
    return canonical === undefined || canonical.kind !== "project" ? [] : [{ binding: name, declaration: canonical.declaration }];
  });
}

/** THE FORMS THE SHARED READER DOES NOT ANSWER, enumerated from the target's own export map instead.
 *  Measured against `_shared/reference-fact.ts` on 2026-09-13: `resolveModuleMemberOrigin` returns
 *  `unsupported: NamespaceImport is not a supported module-member binding` and the same for an
 *  `ExportSpecifier`, and it stops at the `ExportAssignment` of an `export default <identifier>` rather than
 *  at the declaration behind it. That is a READER GAP reported with this arm, not a licence for a binding
 *  walk: `getExportedDeclarations()` is a read of the TARGET's own export map (it resolves re-export chains
 *  itself and is no part of #2097's closed member tuple), and a name the map does not carry REFUSES. */
function enumeratedValues(target: SourceFile, names: readonly string[] | undefined, doorPath: string): readonly ReceivedValue[] {
  const exported = target.getExportedDeclarations();
  return (names ?? [...exported.keys()]).flatMap((binding) => {
    const declarations = exported.get(binding);
    if (declarations === undefined) {
      throw new Error(`${UNREADABLE_BINDING} binding \`${binding}\` from ${doorPath}: the target's export map does not carry it.`);
    }
    return declarations.map((declaration) => ({ binding, declaration }));
  });
}

/** Every value one door receives. A namespace import and an `export *` receive the WHOLE export surface and
 *  are judged over every export — a namespace door is not a cheaper escape than a named one. */
function receivedValues(door: ModuleDoor, target: SourceFile, doorPath: string): readonly ReceivedValue[] {
  let values: readonly ReceivedValue[];
  if (Node.isImportDeclaration(door)) {
    values = door.getNamespaceImport() === undefined ? resolvedBindings(door, doorPath) : enumeratedValues(target, undefined, doorPath);
  } else {
    values = enumeratedValues(target, door.hasNamedExports() ? door.getNamedExports().map((specifier) => specifier.getName()) : undefined, doorPath);
  }
  return values;
}

/** ARM D ON ONE DOOR. The `tooling/src/` fence keeps the read off an installed package's declaration surface
 *  — no gate declares a table there, and asking a `.d.ts` export map for one costs a walk of the package. */
function exemptionValueDoor(door: ModuleDoor, target: SourceFile, path: string): DoorVerdict | undefined {
  let found: DoorVerdict | undefined;
  if (path.includes(TOOLING_SRC)) {
    const doorPath = displayPath(path);
    for (const { binding, declaration } of receivedValues(door, target, doorPath)) {
      const type = exemptionTypeOf(declaration);
      if (type !== undefined) {
        // The home named is the DECLARATION's own file, never the door's target: through a re-export chain
        // the two differ, and the file that has to change is the one the table is declared in.
        found = { kind: "exemption-value", binding, declaration: displayPath(declaration.getSourceFile().getFilePath().replaceAll("\\", "/")), type };
        break;
      }
    }
  }
  return found;
}

function messageOf(verdict: DoorVerdict): string {
  switch (verdict.kind) {
    case "forbidden-home":
      return `${MESSAGE} Resolved home: ${verdict.home.slice(1)}.`;
    case "laundered":
      return `${LAUNDERED_MESSAGE} Resolved chain: ${verdict.shim} re-exports ${verdict.home.slice(1)}.`;
    case "forbidden-prefix":
      return `${PREFIX_MESSAGE} Resolved target: ${verdict.target}, under ${verdict.prefix.slice(1)}.`;
    case "sibling-gate":
      return `${SIBLING_MESSAGE} Resolved target: ${verdict.target}, a ${verdict.contract} gate module.`;
    case "exemption-value":
      return `${EXEMPTION_VALUE_MESSAGE} Received binding: ${verdict.binding}, declared in ${verdict.declaration}; contained canonical identity: ${verdict.type}.`;
    case "unreadable":
      return UNREADABLE_MESSAGE;
  }
}

function judgeModule(ctx: GatePolicyContext, doors: readonly ModuleDoor[]): void {
  for (const door of doors) {
    const verdict = judgeDoor(door);
    const specifier = door.getModuleSpecifier();
    if (verdict === undefined || specifier === undefined) {
      continue;
    }
    ctx.report.node(door, { token: specifier.getText(), offset: specifier.getStart() - door.getStart(), message: messageOf(verdict) });
  }
}

/** A final module importing `named` from `specifier`, beside the planted target so the origin resolves. */
const IMPORTING = (specifier: string, named: string, prelude = ""): string =>
  finalProbeModule(
    `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
    `${prelude}import type { ${named} } from "${specifier}";\n`,
  );
const TARGET = (path: string, named: string): Readonly<Record<string, string>> => ({ [path]: `export type ${named} = unknown;\n` });
/** A registering FINAL sibling beside the probe: its own canonical `defineGate` through the planted contract stub. */
const FINAL_SIBLING =
  'import { defineGate } from "../contract/policy.ts";\nexport const HELPER = 1;\nexport type Helper = number;\nexport const gate = defineGate({ id: "sibling" });\n';
/** A registering LEGACY sibling: a `gate` descriptor object, the loader's rule 2. */
const LEGACY_SIBLING =
  'export const SANCTIONED = ["a"];\nexport const gate = { name: "legacy-sibling", docRow: "x", message: "m", mustFlag: [1], mustPass: [1] };\n';
const SIBLING_PATH = "tooling/src/verify/gates/sibling.ts";
const LEGACY_SIBLING_PATH = "tooling/src/verify/gates/legacy-sibling.ts";
/** A synthetic value import of a registering sibling's export. */
const IMPORTING_VALUE = (specifier: string, named: string): string =>
  finalProbeModule(
    `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
    `import { ${named} } from "${specifier}";\n`,
  );

/** ARM D's fixtures need a REAL `contract/gate.ts`: the arm resolves the type NAME to its declaration, so a
 *  `type ExemptionTable = unknown` stub would prove a spelling. This is the live shape, minus the prose —
 *  and it is still the live shape after #2176 Phase F, which deleted that module's descriptor half and kept
 *  exactly these two declarations. */
const GATE_TYPE_HOME: Readonly<Record<string, string>> = {
  "tooling/src/verify/contract/gate.ts":
    "export interface ExemptionRow {\n  readonly why: string;\n}\nexport type ExemptionTable<Row extends ExemptionRow = ExemptionRow> = Readonly<Record<string, Row>>;\n",
};
/** A `lib/` module holding a RELOCATED gate-owned table — the live `lib/raw-spacing-tier.ts` shape. */
const RELOCATED_TABLE =
  'import type { ExemptionTable } from "../contract/gate.ts";\nexport const SANCTIONED_HOMES: ExemptionTable = { "packages/ui/src/layout/": { why: "w" } };\n';
/** A final module carrying an arbitrary import prelude — ARM D's rows vary the DOOR FORM, not the descriptor. */
const RECEIVING = (prelude: string): string =>
  finalProbeModule(
    `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
    prelude,
  );

export const gate = defineGate({
  id: "policy-legacy-imports",
  family: "policy-soundness",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling"], under: ["tooling/src/verify/gates/**"], notUnder: ["tooling/src/verify/gates/_proof/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const doors = new Map<SourceFile, ModuleDoor[]>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration, SyntaxKind.ExportDeclaration],
          visit: (node, sourceFile): void => {
            if (Node.isImportDeclaration(node) || Node.isExportDeclaration(node)) {
              doors.set(sourceFile, [...(doors.get(sourceFile) ?? []), node]);
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const sourceFile of ctx.files) {
          const path = ctx.relativePath(sourceFile);
          if (finalRegistrationOf(sourceFile) !== undefined) {
            judgeModule(ctx, doors.get(sourceFile) ?? []);
          } else if (path === SELF) {
            throw new Error(BLIND);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/finite-boxes.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/finite-boxes.ts":
          'import type { ExemptionRow } from "../contract/gate.ts"; type Box<T> = { value: T }; export const VALUE: Box<Box<ExemptionRow>> = { value: { value: { why: "w" } } };',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D DATA CONTAINMENT \u2014 Finite nested applications of the same generic constructor peel supplied arguments and still carry canonical data.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: { first: ExemptionRow } = { first: { why: "w" } };\n',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D DATA CONTAINMENT \u2014 An ordinary named data property and a finite Record carry the same canonical identity; syntax cannot decide collection intent.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/readonly-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/readonly-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: Readonly<{ first: ExemptionRow }> = { first: { why: "w" } };\n',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D DATA CONTAINMENT \u2014 Readonly preserves the canonical data property; the binding need not itself be an ExemptionRow.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/partial-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/partial-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: Partial<{ first: ExemptionRow }> = {};\n',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D DATA CONTAINMENT \u2014 An optional carrier is still typed to carry canonical data even when its current initializer is empty. This is not runtime-row evidence.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/readonly-interface-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/readonly-interface-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\ninterface Vocabulary { readonly first: ExemptionRow }\nexport const VALUE: Readonly<Vocabulary> = { first: { why: "w" } };\n',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D DATA CONTAINMENT \u2014 An interface property retains the same Row identity through a modifier wrapper.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/composed-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/composed-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: Readonly<Partial<{ nested: { rows: readonly ExemptionRow[] } }>> = {};\n',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D DATA CONTAINMENT \u2014 Composition of optional, readonly, object and array edges must not change canonical containment.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/recursive-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/recursive-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\ninterface Cycle { row?: ExemptionRow; next?: Cycle }\nexport const VALUE: Cycle = {};\n',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D DATA CONTAINMENT \u2014 A recursive data graph with a canonical leaf terminates by compiler identity and still reports that leaf.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/mutual-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/mutual-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\ntype Left = { right?: Right }; type Right = { left?: Left; row: ExemptionRow };\nexport const VALUE: Left = {};\n',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D DATA CONTAINMENT \u2014 A mutually recursive object graph is finite by type identity, not by an arbitrary hop limit.",
    },

    {
      mode: "types",
      files: familyFixture(IMPORTING("../contract/gate.ts", "ExemptionTable"), TARGET("tooling/src/verify/contract/gate.ts", "ExemptionTable")),
      expect: { count: 1, token: '"../contract/gate.ts"', messageIncludes: "Resolved home: tooling/src/verify/contract/gate.ts" },
      why: "ARM A THE FOUNDING SHAPE and the live class (nine modules at mint): the legacy `ExemptionTable` carried behind `defineGate` — the position is the specifier, because deleting the import is the repair",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/pass.ts", "PassResult"), TARGET("tooling/src/verify/lib/pass.ts", "PassResult")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/pass.ts" },
      why: "ARM A MEMBER `lib/pass.ts` — the legacy dispatcher. The module was DELETED at #2176 Phase F, and the row is deliberately kept: it is the tripwire that reds the day the path comes back. The fixture plants its own target, so the row proves the same property it always did",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/gate-ignore.ts", "GateIgnoreMarker"), TARGET("tooling/src/verify/lib/gate-ignore.ts", "GateIgnoreMarker")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/gate-ignore.ts" },
      why: "ARM A MEMBER `lib/gate-ignore.ts` — the legacy `@orb-gate-ignore` parser (§7 kind 1); a final module consuming it re-opens the retired grammar",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/reviewed-grants.ts", "Grants"), TARGET("tooling/src/verify/lib/reviewed-grants.ts", "Grants")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/reviewed-grants.ts" },
      why: "ARM A MEMBER `lib/reviewed-grants.ts` — the grant table; §12.5 says a gate module receives none, because a module that reads its own grants decides its own exemptions",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/ordinary-waiver.ts", "Engine"), TARGET("tooling/src/verify/lib/ordinary-waiver.ts", "Engine")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/ordinary-waiver.ts" },
      why: "ARM A MEMBER `lib/ordinary-waiver.ts` — the central marker engine; a module that parses markers is a private marker parser by another address, and importing the engine's module for a pure helper hands the gate the parser's whole export surface (the three live #2155 sites)",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/gate-authority.ts", "Coordinator"), TARGET("tooling/src/verify/lib/gate-authority.ts", "Coordinator")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/gate-authority.ts" },
      why: "ARM A MEMBER `lib/gate-authority.ts` — the central coordinator that owns severity and suppression; a detector never selects its own door",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/policy-pass.ts", "PassInput"), TARGET("tooling/src/verify/lib/policy-pass.ts", "PassInput")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/policy-pass.ts" },
      why: "ARM A MEMBER `lib/policy-pass.ts` — the final dispatcher; a pass inside a pass is the private workspace cache §12.3 forbids",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/loader.ts", "Corpus"), TARGET("tooling/src/verify/lib/loader.ts", "Corpus")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/loader.ts" },
      why: "ARM A MEMBER `lib/loader.ts` — the registry; a module that loads the corpus it belongs to judges itself",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/policy-loader.ts", "PolicyCorpus"), TARGET("tooling/src/verify/lib/policy-loader.ts", "PolicyCorpus")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/policy-loader.ts" },
      why: "ARM A MEMBER `lib/policy-loader.ts` — the final-only registry view, the same door one module over",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../ops/debt.ts", "Ledger"), TARGET("tooling/src/verify/ops/debt.ts", "Ledger")),
      expect: { count: 1, token: '"../ops/debt.ts"', messageIncludes: "under tooling/src/verify/ops/" },
      why: "ARM A's DIRECTORY-CLASS member (#2186, matrix C10): the only home judged by a PREFIX. `ops/debt.ts` is a real verb implementation and the live mirror image — `ops/debt.ts:51-52` reaches INTO two legacy gates' `BASELINE_REL`, which is the same coupling from the other end and retires at the cutover. The position is the specifier because deleting the import is the repair",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/shim.ts", "ExemptionTable"), {
        "tooling/src/verify/lib/shim.ts": 'export type { ExemptionTable } from "../contract/gate.ts";\n',
        ...TARGET("tooling/src/verify/contract/gate.ts", "ExemptionTable"),
      }),
      expect: { count: 1, token: '"../lib/shim.ts"', messageIncludes: "re-exports tooling/src/verify/contract/gate.ts" },
      why: "THE LAUNDERING SHAPE (#2201) and the reason #2096 needed this arm to stay closed: a one-hop `lib/` re-export defeats BOTH arms on its own — the basename is not a forbidden home's, and the shim registers no gate — while the importing module receives the legacy contract anyway. The message names the SHIM and the HOME because either end can be the repair",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/shim.ts", "Thing"), { "tooling/src/verify/lib/shim.ts": 'export type { Thing } from "./never-built.ts";\n' }),
      expect: { count: 1, token: '"../lib/shim.ts"', messageIncludes: "resolves to NOTHING" },
      why: 'FAIL-CLOSED ONE HOP IN: a re-export whose own specifier is a CANDIDATE (relative) and resolves nowhere is reported, because the chain could end at a forbidden home and nothing can say it does not. The candidate discipline is identical at every hop, which is what keeps this from convicting `export … from "ts-morph"` — outside the candidate set unreadability is ordinary, and the #2185 lesson is that fail-closed there is a false-accusation engine',
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../ops/never-built.ts", "Thing")),
      expect: { count: 1, token: '"../ops/never-built.ts"', messageIncludes: "resolves to NOTHING" },
      why: "ARM A PREFIX FAIL-CLOSED: an `ops/` specifier that resolves nowhere is reported under the disjoint UNREADABLE text, not acquitted. Without this row the prefix candidacy could silently become fail-OPEN for exactly the spelling it was added to catch",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../contract/gate.ts", "ExemptionTable")),
      expect: { count: 1, token: '"../contract/gate.ts"', messageIncludes: "resolves to NOTHING" },
      why: "ARM A FAIL-CLOSED (#944): a candidate specifier that resolves nowhere is reported under the disjoint UNREADABLE text — the origin cannot be established, and acquitting it on its spelling would be the failure mode",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import type { ExemptionTable } from "../contract/gate.ts";\nimport type { Finding } from "../contract/gate.ts";\n',
        ),
        TARGET("tooling/src/verify/contract/gate.ts", "ExemptionTable | Finding"),
      ),
      expect: { count: 2, messageIncludes: "Resolved home: tooling/src/verify/contract/gate.ts" },
      why: "ARM A TWO declarations are TWO findings, each at its own specifier — the live `depcruise-grant-liveness` and `runner-config-path-liveness` shape (`ExemptionTable` and `Finding` on separate lines)",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING_VALUE("./sibling.ts", "HELPER"), { [SIBLING_PATH]: FINAL_SIBLING }),
      expect: { count: 1, token: '"./sibling.ts"', messageIncludes: "Resolved target: tooling/src/verify/gates/sibling.ts, a final gate module" },
      why: "ARM B THE FOUNDING SHAPE (#2096): a value import of a synthetic sibling FINAL gate's export. The target registers through the canonical defineGate in the planted contract, which is the predicate; this row does not claim a current production population",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING_VALUE("./legacy-sibling.ts", "SANCTIONED"), { [LEGACY_SIBLING_PATH]: LEGACY_SIBLING }),
      expect: { count: 1, token: '"./legacy-sibling.ts"', messageIncludes: "a legacy gate module" },
      why: "ARM B the LEGACY contract registers too (the loader's rule 2, a gate descriptor object). This synthetic sibling keeps the legacy registration arm covered independently of which production modules still use that contract; the arm names which contract registered",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING_VALUE("../gates/sibling.ts", "HELPER"), { [SIBLING_PATH]: FINAL_SIBLING }),
      expect: { count: 1, token: '"../gates/sibling.ts"', messageIncludes: "a final gate module" },
      why: "ARM B IDENTITY, NOT SPELLING: the same sibling reached through the parent directory resolves to the same registering module — a spelling-keyed arm would admit it",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("./sibling.ts", "Helper"), { [SIBLING_PATH]: FINAL_SIBLING }),
      expect: { count: 1, token: '"./sibling.ts"', messageIncludes: "a final gate module" },
      why: "ARM B a TYPE-ONLY import is coupling all the same: a type has one home (`contract/` or `lib/`), and a sibling gate is not it — the ruling says NEVER imports, and a type door is an import",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'export { HELPER } from "./sibling.ts";\n',
        ),
        { [SIBLING_PATH]: FINAL_SIBLING },
      ),
      expect: { count: 1, token: '"./sibling.ts"', messageIncludes: "a final gate module" },
      why: "ARM B an `export … from` RE-EXPORT is an import in effect — the module republishes its sibling's export and the coupling is the same door spelled outward; an `ImportDeclaration`-only visitor would miss it",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING_VALUE("./nowhere.ts", "HELPER")),
      expect: { count: 1, token: '"./nowhere.ts"', messageIncludes: "resolves to NOTHING" },
      why: "ARM B FAIL-CLOSED (#944): a RELATIVE specifier that resolves nowhere could have named a sibling gate, and its origin cannot be established — reported under the disjoint UNREADABLE text, never acquitted on its spelling",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { SANCTIONED_HOMES } from "../lib/raw-spacing-tier.ts";\nexport const homes = SANCTIONED_HOMES;\n'), {
        "tooling/src/verify/lib/raw-spacing-tier.ts": RELOCATED_TABLE,
        ...GATE_TYPE_HOME,
      }),
      expect: {
        count: 1,
        token: '"../lib/raw-spacing-tier.ts"',
        messageIncludes:
          "Received binding: SANCTIONED_HOMES, declared in tooling/src/verify/lib/raw-spacing-tier.ts; contained canonical identity: ExemptionTable",
      },
      why: "ARM D THE FOUNDING SHAPE and the escape #2320 measured: a gate-owned `ExemptionTable` RELOCATED one hop into `lib/` and imported back. ARM A acquits it (the specifier resolves to an innocent `lib/` module), ARM B acquits it (the target registers no gate), and the laundering walk acquits it (the target re-exports nothing) — this row is the receipt that all three did, and that the substance is received anyway. Four of the nine modules named at this policy's mint went green exactly this way",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { SANCTIONED_HOMES as HOMES } from "../lib/raw-spacing-tier.ts";\nexport const homes = HOMES;\n'), {
        "tooling/src/verify/lib/raw-spacing-tier.ts": RELOCATED_TABLE,
        ...GATE_TYPE_HOME,
      }),
      expect: { count: 1, token: '"../lib/raw-spacing-tier.ts"', messageIncludes: "Received binding: SANCTIONED_HOMES" },
      why: "ARM D IMPORT FORM — an ALIASED named import. The binding is judged by its name IN THE TARGET, so renaming it locally is not a second escape; the message names the EXPORTED name because that is the declaration the migration has to move",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import HOMES from "../lib/raw-spacing-tier.ts";\nexport const homes = HOMES;\n'), {
        "tooling/src/verify/lib/raw-spacing-tier.ts":
          'import type { ExemptionTable } from "../contract/gate.ts";\nconst SANCTIONED_HOMES: ExemptionTable = { "packages/ui/src/layout/": { why: "w" } };\nexport default SANCTIONED_HOMES;\n',
        ...GATE_TYPE_HOME,
      }),
      expect: { count: 1, token: '"../lib/raw-spacing-tier.ts"', messageIncludes: "Received binding: default" },
      why: "ARM D IMPORT FORM — a DEFAULT import whose target declares the table as a NAMED CONST behind `export default <identifier>`. The door names no binding at all, so an arm reading only named imports would acquit the cheapest relocation there is",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import HOMES from "../lib/raw-spacing-tier.ts";\nexport const homes = HOMES;\n'), {
        "tooling/src/verify/lib/raw-spacing-tier.ts":
          'import type { ExemptionTable } from "../contract/gate.ts";\nexport default ({ "packages/ui/src/layout/": { why: "w" } } satisfies ExemptionTable);\n',
        ...GATE_TYPE_HOME,
      }),
      expect: {
        count: 1,
        token: '"../lib/raw-spacing-tier.ts"',
        messageIncludes: "declared in tooling/src/verify/lib/raw-spacing-tier.ts; contained canonical identity: ExemptionTable",
      },
      why: "ARM D IMPORT FORM — a DIRECT typed default export (`export default (… satisfies ExemptionTable)`), and it is the row an independent review REFUTED the first cut on: there is NO declaration behind the assignment, so the identifier hop finds nothing and the table crossed the door acquitted WITHOUT being retyped. The value's own top-level assertion is read through the SAME canonical resolver as an annotation — one resolver, no initializer-interior heuristics",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import HOMES from "../lib/raw-spacing-tier.ts";\nexport const homes = HOMES;\n'), {
        "tooling/src/verify/lib/raw-spacing-tier.ts":
          'import type { ExemptionTable } from "../contract/gate.ts";\nexport default ({ "packages/ui/src/layout/": { why: "w" } } as ExemptionTable);\n',
        ...GATE_TYPE_HOME,
      }),
      expect: { count: 1, token: '"../lib/raw-spacing-tier.ts"', messageIncludes: "contained canonical identity: ExemptionTable" },
      why: "ARM D IMPORT FORM — the `as ExemptionTable` TWIN of the direct typed default. Two spellings of one escape: an arm that reads `satisfies` alone leaves the other free, and both carry the canonical identity",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import * as tier from "../lib/raw-spacing-tier.ts";\nexport const homes = tier.SANCTIONED_HOMES;\n'), {
        "tooling/src/verify/lib/raw-spacing-tier.ts": RELOCATED_TABLE,
        ...GATE_TYPE_HOME,
      }),
      expect: { count: 1, token: '"../lib/raw-spacing-tier.ts"', messageIncludes: "Received binding: SANCTIONED_HOMES" },
      why: "ARM D IMPORT FORM — a NAMESPACE import reached by MEMBER ACCESS. The door receives the WHOLE export surface, so every export is judged; keying on the named-import list would leave `ns.TABLE` free",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('export { SANCTIONED_HOMES } from "../lib/raw-spacing-tier.ts";\n'), {
        "tooling/src/verify/lib/raw-spacing-tier.ts": RELOCATED_TABLE,
        ...GATE_TYPE_HOME,
      }),
      expect: { count: 1, token: '"../lib/raw-spacing-tier.ts"', messageIncludes: "Received binding: SANCTIONED_HOMES" },
      why: "ARM D IMPORT FORM — an `export … from` RE-EXPORT DOOR: the module receives the table and republishes it, which is the same receipt spelled outward (ARM B's own re-export row is the precedent)",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { SANCTIONED_HOMES } from "../lib/shim.ts";\nexport const homes = SANCTIONED_HOMES;\n'), {
        "tooling/src/verify/lib/shim.ts": 'export { SANCTIONED_HOMES } from "./deeper.ts";\n',
        "tooling/src/verify/lib/deeper.ts": 'export { SANCTIONED_HOMES } from "./raw-spacing-tier.ts";\n',
        "tooling/src/verify/lib/raw-spacing-tier.ts": RELOCATED_TABLE,
        ...GATE_TYPE_HOME,
      }),
      expect: {
        count: 1,
        token: '"../lib/shim.ts"',
        messageIncludes: "declared in tooling/src/verify/lib/raw-spacing-tier.ts; contained canonical identity: ExemptionTable",
      },
      why: "ARM D IMPORT FORM — a TWO-HOP re-export chain. The shared reader resolves the chain to the DECLARATION, so the message names where the table really lives rather than the nearest shim; a one-hop-only walk would make a second shim the whole escape again (the #2201 lesson, one arm over)",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { PORTABILITY_ROW } from "../lib/rows.ts";\nexport const row = PORTABILITY_ROW;\n'), {
        "tooling/src/verify/lib/rows.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\nexport const PORTABILITY_ROW: ExemptionRow = { why: "w" };\n',
        ...GATE_TYPE_HOME,
      }),
      expect: { count: 1, token: '"../lib/rows.ts"', messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D the vocabulary is BOTH names: a single `ExemptionRow`-typed value is an exemption received one row at a time, and a table-only arm would take `Record<string, ExemptionRow>` to `ExemptionRow[]` as its next hop",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { HOMES } from "../lib/aliased-table.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/aliased-table.ts":
          'import type { ExemptionTable as Base } from "../contract/gate.ts";\ntype Homes = Base;\nexport const HOMES: Homes = { a: { why: "w" } };\n',
      }),
      expect: { count: 1, token: '"../lib/aliased-table.ts"', messageIncludes: "contained canonical identity: ExemptionTable" },
      why: "ARM D TYPE ALIAS — naming the canonical table type locally does not retype it. The outer Homes identifier is local, so resolving that identifier as a module VALUE missed this received table; the shared annotation query must reach the imported Base type declaration",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { ROWS } from "../lib/aliased-rows.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/aliased-rows.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\ntype FreshnessRow = ExemptionRow & { readonly plane: string };\ntype Rows = Readonly<Record<string, FreshnessRow>>;\nexport const ROWS: Rows = { a: { why: "w", plane: "types" } };\n',
      }),
      expect: { count: 1, token: '"../lib/aliased-rows.ts"', messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D NESTED TYPE ALIAS — the independently refuted FreshnessRow intersection behind a Record argument. Both alias expansion and container traversal must reach ExemptionRow; stopping at the outer local name or at Record's own declaration makes this falsely clean",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { ROWS } from "../lib/namespace-rows.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/namespace-rows.ts":
          'import type * as Contract from "../contract/gate.ts";\ntype LocalRow = Contract.ExemptionRow;\nexport const ROWS: readonly LocalRow[] = [{ why: "w" }];\n',
      }),
      expect: { count: 1, token: '"../lib/namespace-rows.ts"', messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D TYPE NAMESPACE — an alias of a qualified canonical row type carries the same identity; reading only bare type identifiers would miss the namespace spelling",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { ROWS } from "../lib/imported-alias.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/row-kind.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\nexport type RowKind = ExemptionRow & { readonly plane: string };\n',
        "tooling/src/verify/lib/row-alias.ts": 'export type { RowKind as PublishedRow } from "./row-kind.ts";\n',
        "tooling/src/verify/lib/imported-alias.ts":
          'import type { PublishedRow as LocalRow } from "./row-alias.ts";\nexport const ROWS: Readonly<Record<string, LocalRow>> = { a: { why: "w", plane: "types" } };\n',
      }),
      expect: { count: 1, token: '"../lib/imported-alias.ts"', messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D IMPORTED TYPE ALIAS — the value's own annotation reaches an alias through a type re-export, while the value-producing module re-exports nothing. This is annotation provenance, not ARM A's forbidden-home re-export walk",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import HOMES from "../lib/aliased-default.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/aliased-default.ts":
          'import type { ExemptionTable } from "../contract/gate.ts";\ntype Homes = ExemptionTable;\nexport default ({ a: { why: "w" } } satisfies Homes);\n',
      }),
      expect: { count: 1, token: '"../lib/aliased-default.ts"', messageIncludes: "contained canonical identity: ExemptionTable" },
      why: "ARM D TYPE ALIAS IN A DIRECT DEFAULT — the transferred default-expression repair and the alias repair must compose through the same annotation reader; an alias must not reopen the default-export hole",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { ROWS } from "../lib/named-tuple.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/named-tuple.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\ntype Rows = readonly [row?: ExemptionRow, ...rows: ExemptionRow[]];\nexport const ROWS: Rows = [{ why: "w" }];\n',
      }),
      expect: { count: 1, token: '"../lib/named-tuple.ts"', messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D NAMED TUPLE — naming an optional or rest tuple member adds a syntax wrapper, not a different type identity. The same shared tuple traversal must reach the canonical row behind those wrappers",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { ROWS } from "../lib/optional-rest-tuple.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/optional-rest-tuple.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\ntype Rows = readonly [ExemptionRow?, ...ExemptionRow[]];\nexport const ROWS: Rows = [{ why: "w" }];\n',
      }),
      expect: { count: 1, token: '"../lib/optional-rest-tuple.ts"', messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D OPTIONAL AND REST TUPLE — unlabeled optional/rest elements have different wrapper nodes from named members; a tuple claim that reads only bare reference elements leaves both spellings falsely clean",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/identity-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/identity-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\ntype Identity<T> = T;\nexport const VALUE: Identity<ExemptionRow> = { why: "w" };\n',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D VALUE SEMANTICS \u2014 An identity generic resolves to the canonical row value; generic argument presence alone is not this proof.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/indexed-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/indexed-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: ExemptionTable[string] = { why: "w" };\n',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D VALUE SEMANTICS \u2014 An indexed access returning the canonical row is a received row; the same operation returning a primitive must pass.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/returned-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/returned-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: ReturnType<() => ExemptionRow> = { why: "w" };\n',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D VALUE SEMANTICS \u2014 ReturnType yields an actual row value, unlike receiving the callable that returns that row.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/finite-rows.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/finite-rows.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\nexport const VALUE: Record<"first", ExemptionRow> = { first: { why: "w" } };',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D VALUE SEMANTICS \u2014 A finite Record property carries canonical Row identity, exactly as an ordinary named data property or open index signature does.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/conditional-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/conditional-row.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\nexport const VALUE: ExemptionRow extends object ? ExemptionRow : string = { why: "w" };',
      }),
      expect: { count: 1, messageIncludes: "contained canonical identity: ExemptionRow" },
      why: "ARM D CONDITIONAL OUTPUT — the checker resolves the output branch; a canonical condition or unselected branch is not received-value evidence. The paired row and text outputs discriminate this path.",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/indexed-opaque-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/indexed-opaque-row.ts":
          'import type { ExemptionRow } from "../contract/gate.ts"; type Holder = { row: ExemptionRow | unknown; clean: unknown }; export declare const VALUE: Holder["row"];',
      }),
      expect: { messageIncludes: "opaque value type does not establish this authored candidate's identity" },
      why: "ARM D SELECTED DATA \u2014 an indexed projection reads only the selected member provenance; the unknown clean field must not inherit its sibling's canonical candidate.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/expanding-data.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/expanding-data.ts":
          'import type { ExemptionRow } from "../contract/gate.ts"; type Nested<T, D> = { value: Readonly<D>; next: Nested<D, T> }; export declare const VALUE: Nested<ExemptionRow, string>;',
      }),
      expect: { messageIncludes: "member provenance does not establish the containing value's type identity" },
      why: "ARM D DATA CONTAINMENT \u2014 A stable parameter rotation carries canonical provenance only into an identity-losing projection. Its finite cycle remains unsupported rather than clearing or inventing a canonical identity.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/opaque-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/opaque-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: { row: ExemptionRow | unknown } = { row: undefined };\n',
      }),
      expect: { messageIncludes: "BINDING UNREADABLE" },
      why: "ARM D DATA CONTAINMENT \u2014 An unknown property absorbs canonical identity but must retain its authored candidate as refusal.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/opaque-interface-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/opaque-interface-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\ninterface Opaque { row: ExemptionRow | unknown }\nexport const VALUE: Opaque = { row: undefined };\n',
      }),
      expect: { messageIncludes: "BINDING UNREADABLE" },
      why: "ARM D DATA CONTAINMENT \u2014 Authored property provenance must survive a named interface as well as an inline type literal.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/projected-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/projected-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: { row: Readonly<ExemptionRow> } = { row: { why: "w" } };\n',
      }),
      expect: { messageIncludes: "BINDING UNREADABLE" },
      why: "ARM D DATA CONTAINMENT \u2014 A nested identity-losing canonical projection remains unsupported, not a clean wrapper.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/opaque-cycle-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/opaque-cycle-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\ntype Loop = Loop | ExemptionRow;\nexport const VALUE: { row: Loop } = { row: undefined };\n',
      }),
      expect: { messageIncludes: "BINDING UNREADABLE" },
      why: "ARM D DATA CONTAINMENT \u2014 A data property containing an invalid opaque canonical cycle refuses rather than inventing identity.",
    },

    {
      mode: "types",
      files: { [SELF]: 'export const gate = { id: "policy-legacy-imports", message: "m" };\n' },
      expect: { messageIncludes: "BLINDNESS" },
      why: "THE BLINDNESS TRIPWIRE, FIRED: this module's own path carrying a descriptor the recognizer does not admit must REFUSE, never report a clean corpus",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { MISSING } from "../lib/thin.ts";\nexport const read = MISSING;\n'), {
        "tooling/src/verify/lib/thin.ts": "export const PRESENT = 1;\n",
      }),
      expect: { messageIncludes: "BINDING UNREADABLE" },
      why: "ARM D FAIL-CLOSED, and it is a REFUSAL rather than a finding because the two are different states: the door RESOLVED, so the #2185 acquittal (unreadability outside a candidate set is ordinary) does not apply, but the binding's declaration cannot be read at all — so the arm can neither convict nor clear it, and reporting a clean corpus over an unreadable declaration is the fail-open the whole receipt arm exists to prevent",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { ROWS } from "../lib/missing-row-type.ts";\n'), {
        "tooling/src/verify/contract/gate.ts": "export interface Other { readonly why: string }\n",
        "tooling/src/verify/lib/missing-row-type.ts":
          'import type { ExemptionRow as Row } from "../contract/gate.ts";\ntype LocalRow = Row;\nexport const ROWS: readonly LocalRow[] = [];\n',
      }),
      expect: { messageIncludes: "BINDING UNREADABLE" },
      why: "ARM D TYPE ALIAS FAIL-CLOSED — every module specifier resolves, but the canonical import names a type its target does not declare. The shared query must retain Row as the unreadable imported leaf; classifying only the outer LocalRow declaration would falsely acquit it as an unrelated local binding",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/readonly-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/readonly-row.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\n\nexport const VALUE: Readonly<ExemptionRow> = { why: "w" };',
      }),
      expect: { messageIncludes: "member provenance" },
      why: "ARM D VALUE SEMANTICS \u2014 A modifier map retains canonical member provenance but no named row identity. Refuse this candidate instead of declaring it unrelated or claiming a canonical value proof.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/opaque-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/opaque-row.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\n\nexport const VALUE: ExemptionRow | unknown = { why: "w" };',
      }),
      expect: { messageIncludes: "opaque value type" },
      why: "ARM D VALUE SEMANTICS \u2014 Unknown absorbs the canonical row arm. Its occurrence is a candidate, but the checker cannot prove the received value type.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/cyclic-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/cyclic-row.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\ntype Loop = Loop | ExemptionRow;\nexport const VALUE: Loop = { why: "w" };',
      }),
      expect: { messageIncludes: "opaque value type" },
      why: "ARM D VALUE SEMANTICS \u2014 The invalid cyclic alias resolves to any. Preserve its canonical candidate as unreadability, not the old syntax-only positive.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/missing-after-erasure.ts";\n'), {
        "tooling/src/verify/contract/gate.ts": "export interface Other { why: string }",
        "tooling/src/verify/lib/missing-after-erasure.ts":
          'import type { ExemptionRow as Row } from "../contract/gate.ts";\ntype Local = Row;\ntype Phantom<T> = string;\nexport const VALUE: [readonly Local[], Phantom<Local>] = [[], "subject"];',
      }),
      expect: { messageIncludes: "BINDING UNREADABLE" },
      why: "ARM D ALIAS PATHS — the same alias occurs in an erased generic argument and an actual array element. Visiting the erased path must not consume the actual path's missing canonical provenance; the ordering twin pins both traversal orders.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/missing-before-erasure.ts";\n'), {
        "tooling/src/verify/contract/gate.ts": "export interface Other { why: string }",
        "tooling/src/verify/lib/missing-before-erasure.ts":
          'import type { ExemptionRow as Row } from "../contract/gate.ts";\ntype Local = Row;\ntype Phantom<T> = string;\nexport const VALUE: [Phantom<Local>, readonly Local[]] = ["subject", []];',
      }),
      expect: { messageIncludes: "BINDING UNREADABLE" },
      why: "ARM D ALIAS PATHS — the same alias occurs in an erased generic argument and an actual array element. Visiting the erased path must not consume the actual path's missing canonical provenance; the ordering twin pins both traversal orders.",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/erased-expanding-data.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/erased-expanding-data.ts":
          'import type { ExemptionRow } from "../contract/gate.ts"; type Nested<T> = { next: Nested<T[]> }; export declare const VALUE: Nested<ExemptionRow>;',
      }),
      why: "ARM D DATA CONTAINMENT \u2014 A supplied canonical argument erased from every data position remains syntax only even when the generic recursively changes its instantiation.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/indexed-opaque-clean.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/indexed-opaque-clean.ts":
          'import type { ExemptionRow } from "../contract/gate.ts"; type Holder = { row: ExemptionRow | unknown; clean: unknown }; export declare const VALUE: Holder["clean"];',
      }),
      why: "ARM D SELECTED DATA \u2014 an indexed projection reads only the selected member provenance; the unknown clean field must not inherit its sibling's canonical candidate.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/foreign-expanding-data.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/foreign-expanding-data.ts":
          "interface ExemptionRow { why: string } type Nested<T> = { next: Nested<T[]> }; export declare const VALUE: Nested<ExemptionRow>;",
      }),
      why: "ARM D DATA CONTAINMENT \u2014 The same unsupported recursive graph with proven foreign provenance must not become a canonical accusation.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/callable-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/callable-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: { read: (row: ExemptionRow) => ExemptionRow } = { read: (row) => row };\n',
      }),
      why: "ARM D DATA CONTAINMENT \u2014 A named property holding a callable does not carry that callable's parameter or result as data.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/method-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/method-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: { read(row: ExemptionRow): ExemptionRow } = { read: (row) => row };\n',
      }),
      why: "ARM D DATA CONTAINMENT \u2014 Method and function-property spellings share the same callable-signature exclusion.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/foreign-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/foreign-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: Readonly<{ row: { why: string } }> = { row: { why: "w" } };\n',
      }),
      why: "ARM D DATA CONTAINMENT \u2014 A structural lookalike behind the same wrapper has no canonical declaration identity.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/erased-object-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/erased-object-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\ntype Phantom<T> = string;\nexport const VALUE: { key: keyof ExemptionTable; erased: Phantom<ExemptionRow>; opaque: unknown } = { key: "k", erased: "s", opaque: undefined };\n',
      }),
      why: "ARM D DATA CONTAINMENT \u2014 An opaque sibling must not revive canonical names proven erased in other properties.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/foreign-cycle-row.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/foreign-cycle-row.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\ninterface Cycle { next?: Cycle; row: { why: string } }\nexport const VALUE: Cycle = { row: { why: "w" } };\n',
      }),
      why: "ARM D DATA CONTAINMENT \u2014 Recursive data without a canonical leaf terminates cleanly; recursion is not itself a canonical candidate.",
    },

    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ),
      ),
      why: "a clean final module importing only the final contract — the ordinary shape of the converted corpus (the `../contract/policy.ts` door is a relative candidate of ARM B, resolves to the contract stub, and the stub registers nothing)",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/reader.ts", "Read"), {
        // A REAL shared reader's shape, measured: the whole of `verify/lib/` + `verify/contract/` holds exactly
        // two `export … from` declarations at this arm's landing (`config-static-read.ts:17`,
        // `policy-conformance.ts:14`), and both re-export a CONTRACT TYPE HOME that is not forbidden. This row is
        // that shape. Without it the chain walk would be an arm that only accuses — and three rows tonight proved
        // an arm that only accuses is worse than the blindness it replaced.
        "tooling/src/verify/lib/reader.ts": 'export type { Read } from "../contract/config-read.ts";\n',
        ...TARGET("tooling/src/verify/contract/config-read.ts", "Read"),
      }),
      why: "THE ACQUITTING HALF OF #2201: a legitimate `lib/` reader that DOES re-export — from a contract type home that is not forbidden — and the gate that imports it passes. The walk convicts on WHERE THE CHAIN LANDS, never on the existence of a re-export",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/ops/reader.ts", "OpsRead"), TARGET("tooling/src/verify/lib/ops/reader.ts", "OpsRead")),
      why: 'THE PREFIX\'S FALSE-POSITIVE GUARD (#2186), and it is the row that makes the prefix IDENTITY rather than SPELLING: this specifier IS a candidate — it carries the `ops/` segment — and is still acquitted, because the verdict is the RESOLVED path and this one lands under `lib/`, not under `tooling/src/verify/ops/`. Without it, `includes("ops/")` could quietly become the rule and every `lib/ops/*` reader would be a finding',
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("./pass.ts", "Local"), TARGET("tooling/src/verify/gates/pass.ts", "Local")),
      why: "IDENTITY, NOT SPELLING, both arms at once: a sibling module named `pass.ts` under `gates/` shares a forbidden basename and resolves to an unrelated path (ARM A acquits it by suffix), and it registers no gate (ARM B acquits it by registration — an unregistered top-level module is `gate-modernization` ARM A's finding, not an import defect)",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { finalDescriptorOf } from "../lib/policy-descriptor-read.ts";\nimport { inspectGateContract } from "../lib/gate-contract.ts";\n',
        ),
        {
          "tooling/src/verify/lib/policy-descriptor-read.ts": "export const finalDescriptorOf = 1;\n",
          "tooling/src/verify/lib/gate-contract.ts": "export const inspectGateContract = 1;\n",
        },
      ),
      why: "the shared readers a final module DOES consume — `lib/policy-descriptor-read.ts`, `lib/gate-contract.ts` — resolve to modules that are neither a forbidden home nor a registering gate: ARM B's relative candidates, acquitted by registration",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { SURFACE } from "./_proof/surface.ts";\n',
        ),
        { "tooling/src/verify/gates/_proof/surface.ts": "export const SURFACE = 1;\n" },
      ),
      why: "ARM B THE SHARED PROOF SURFACE: `gates/_proof/**` holds fixture sources that register nothing (`persist-partialize-and-total-migrate` imports `./_proof/zustand.ts` by right, guide §6.5; this family imports `./_proof/policy-soundness.ts`). A directory-keyed arm would red every one of them; the registration test acquits them by construction",
    },
    {
      mode: "types",
      files: familyFixture(
        'import type { ExemptionTable } from "../contract/gate.ts";\nexport const gate = { name: "probe", docRow: "x", message: "m", allow: {} as ExemptionTable, mustFlag: [1], mustPass: [1] };\n',
        {
          ...TARGET("tooling/src/verify/contract/gate.ts", "ExemptionTable"),
        },
      ),
      why: "SCOPE: a LEGACY descriptor imports its own contract by right — this policy reads final modules only",
    },
    {
      mode: "types",
      files: familyFixture(
        'function defineGate(policy: unknown): unknown {\n  return policy;\n}\nimport type { ExemptionTable } from "../contract/gate.ts";\nexport const gate = defineGate({ id: "probe", allow: {} as ExemptionTable });\n',
        TARGET("tooling/src/verify/contract/gate.ts", "ExemptionTable"),
      ),
      why: "IDENTITY of the REGISTRATION too: a same-named LOCAL `defineGate` registers nothing, so its imports are out of scope — `gate-modernization` ARM A names the lookalike",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING_VALUE("./sibling.ts", "HELPER"), {
        [SIBLING_PATH]:
          'function defineGate(policy: unknown): unknown {\n  return policy;\n}\nexport const HELPER = 1;\nexport const gate = defineGate({ id: "sibling" });\n',
      }),
      why: "ARM B IDENTITY of the TARGET's registration: a sibling whose `gate` is a LOCAL `defineGate` lookalike registers nothing (the loader records it UNREGISTERED), so importing it is not importing a gate — the same import-origin discipline the family applies to itself, applied to the target",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { sanctionedHome } from "../lib/sanctioned-home.ts";\nexport const read = sanctionedHome;\n'), {
        "tooling/src/verify/lib/sanctioned-home.ts":
          'import type { ExemptionTable } from "../contract/gate.ts";\nexport function sanctionedHome(homes: ExemptionTable, rel: string): string | undefined {\n  return Object.keys(homes).find((key) => key === rel);\n}\n',
        ...GATE_TYPE_HOME,
      }),
      why: "ARM D THE ACQUITTING HALF, and it is the row that decides the arm's SHAPE: a shared `lib/` reader that takes the table as a PARAMETER holds no rows and grants nothing — it RECEIVES one from its caller. `lib/sanctioned-home.ts` (seven gate importers) and `lib/grant-liveness.ts` (`LivenessInput.exempt`, `PatternLivenessInput.ratified`; imported by the converted exemplars `biome-grant-liveness` and `tsconfig-entry-liveness`) are both this shape, so an arm keyed on the DECLARATION SITE — the wording #2320's own fix text proposed — would red the program's own migration exemplars. The judged type is the imported declaration's OWN, never the interior of a function it declares",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { CALLER_FREE_OP_ROWS } from "../lib/injected-op-caller-param.ts";\nexport const rows = CALLER_FREE_OP_ROWS;\n'), {
        "tooling/src/verify/lib/injected-op-caller-param.ts":
          'export interface CallerFreeOpRow {\n  readonly op: string;\n  readonly why: string;\n}\nexport const CALLER_FREE_OP_ROWS: readonly CallerFreeOpRow[] = [{ op: "ReapAssetsOp", why: "w" }];\n',
      }),
      why: "ARM D'S DECLARED LIMIT, PINNED AS A ROW RATHER THAN AS A SENTENCE (§4.1's fourth outcome): this is the LIVE `lib/injected-op-caller-param.ts` shape — the same per-subject table, RETYPED to a local one-field interface instead of relocated — and ARM D does not see it, by construction. Both constructions that would have were attempted and rejected: a shape arm on `Record<string, { why }>` reds `contract/tenancy-scope.ts#ScopingRow` and every honest cited vocabulary, and a use-provenance arm needs a membership test to reach the ABSENCE of a report, which is control flow and would red this module's own `FORBIDDEN_BASENAMES.has(...)`. The retype class remains a #1922 migration and per-module review obligation, never a closure this arm proves — a `mustPass` that says so is the honest output; a row pretending otherwise would be the lie",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { TABLE } from "../lib/other-vocabulary.ts";\nexport const read = TABLE;\n'), {
        "tooling/src/verify/lib/other-vocabulary.ts":
          'import type { ExemptionTable } from "./foreign-home.ts";\nexport const TABLE: ExemptionTable = { a: 1 };\n',
        "tooling/src/verify/lib/foreign-home.ts": "export type ExemptionTable = Readonly<Record<string, number>>;\n",
        ...GATE_TYPE_HOME,
      }),
      why: "ARM D IDENTITY, NOT SPELLING: a type named `ExemptionTable` declared in a DIFFERENT module is a different type, and the arm resolves the name to its declaration before judging it — the `lib/origin-verdict.ts` discipline the origin arms already apply to a door, applied to a type. Without this row the arm is a string match wearing a resolver's clothes",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import TRIGGERS from "../lib/registry-triggers.ts";\nexport const triggers = TRIGGERS;\n'), {
        "tooling/src/verify/lib/registry-triggers.ts":
          'import type { StageTrigger } from "./stage-trigger.ts";\nexport default ({ stage: { why: "w" } } satisfies StageTrigger);\n',
        "tooling/src/verify/lib/stage-trigger.ts": "export type StageTrigger = Readonly<Record<string, { readonly why: string }>>;\n",
        ...GATE_TYPE_HOME,
      }),
      why: "ARM D'S DIRECT-DEFAULT NEGATIVE, and the reason the new assertion read is an IDENTITY test rather than a shape one: a direct typed default carrying an UNRELATED `why`-bearing vocabulary (the live `lib/registry-triggers.ts#StageTrigger` shape) passes, because the resolved declaration home is not `contract/gate.ts`. Without it, reading the assertion could quietly become 'any typed default of a row-ish object'",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { patternLivenessFindings } from "../lib/grant-liveness.ts";\nexport const read = patternLivenessFindings;\n'), {
        "tooling/src/verify/lib/grant-liveness.ts": "export function patternLivenessFindings(): readonly string[] {\n  return [];\n}\n",
      }),
      why: "ARM D THE MIGRATED SHAPE PASSES: `biome-grant-liveness`, the program's own authority-migration exemplar, imports a shared reader and passes `ratified: {}` — no table crosses the door. The end state of #1922 must be silent under this arm or the arm is a permanent red nobody can clear",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { ROWS } from "../lib/local-row-kind.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/local-row-kind.ts":
          'interface ExemptionRow { readonly why: string }\ntype FreshnessRow = ExemptionRow & { readonly plane: string };\nexport const ROWS: Readonly<Record<string, FreshnessRow>> = { a: { why: "w", plane: "types" } };\n',
      }),
      why: "ARM D ALIAS NEGATIVE — the same nested alias/container spelling names a locally declared row interface, not the canonical declaration. Following aliases must not turn a local structural retype into a canonical type by spelling",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { ROWS } from "../lib/unrelated-unreadable.ts";\n'), {
        "tooling/src/verify/lib/other-kind.ts": "export interface Present { value: string }\n",
        "tooling/src/verify/lib/unrelated-unreadable.ts":
          'import type { Other } from "./other-kind.ts";\ntype LocalRow = Other;\nexport const ROWS: readonly LocalRow[] = [];\n',
      }),
      why: "ARM D CANDIDATE BOUNDARY — an unreadable unrelated imported type remains outside the canonical exemption candidate set. This pins only the policy's scoped identity claim, not compiler validity; blanket refusal on every annotation reference would accuse unrelated vocabulary",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { ROWS } from "../lib/foreign-tuple.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/foreign-tuple.ts":
          'interface ExemptionRow { readonly why: string }\ntype Rows = readonly [row?: ExemptionRow, ...rows: ExemptionRow[]];\nexport const ROWS: Rows = [{ why: "w" }];\n',
      }),
      why: "ARM D TUPLE IDENTITY NEGATIVE — optional/rest member wrappers containing a same-spelled local row do not turn it into the canonical exemption type",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/table-key.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/table-key.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: keyof ExemptionTable = "subject";\n',
      }),
      why: "ARM D VALUE SEMANTICS \u2014 A keyof operation returns a key string, not an exemption value; the independently refuted occurrence reader accused this legal import.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/phantom-table.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/phantom-table.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\ntype Phantom<T> = string;\nexport const VALUE: Phantom<ExemptionTable> = "subject";\n',
      }),
      why: "ARM D VALUE SEMANTICS \u2014 The generic discards its type argument and returns string; an authored canonical argument is not a received exemption.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/row-reader.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/row-reader.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\ntype Reader<T> = (row: T) => T;\nexport const VALUE: Reader<ExemptionRow> = (row) => row;\n',
      }),
      why: "ARM D VALUE SEMANTICS \u2014 A generic callable takes and returns a canonical row but the received value is the reader itself.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/row-text.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/row-text.ts":
          'import type { ExemptionRow, ExemptionTable } from "../contract/gate.ts";\n\nexport const VALUE: ExemptionRow["why"] = "subject";\n',
      }),
      why: "ARM D VALUE SEMANTICS \u2014 Indexed access to the why property produces text; the canonical reference is an operand, not the received value type.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/erased-map.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/erased-map.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\ntype Phantom<T> = { [K in "label"]: string };\nexport const VALUE: Phantom<ExemptionRow> = { label: "subject" };',
      }),
      why: "ARM D VALUE SEMANTICS \u2014 A mapped type can erase its argument too. The produced property has neither canonical row value identity nor canonical member provenance.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/foreign-modifier.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/foreign-modifier.ts": 'interface ExemptionRow { why: string }\nexport const VALUE: Readonly<ExemptionRow> = { why: "w" };',
      }),
      why: "ARM D VALUE SEMANTICS \u2014 Modifier mapping of a same-spelled foreign row preserves that foreign declaration home; incomplete value identity does not create a canonical candidate.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/erased-with-opaque-sibling.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/erased-with-opaque-sibling.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\ntype Phantom<T> = string;\nexport const VALUE: readonly [Phantom<ExemptionRow>, unknown] = ["subject", undefined];\n',
      }),
      why: "ARM D OPAQUE SIBLING — an unknown tuple element does not turn the other element's proven-erased generic argument into a canonical candidate. Each transforming expression bounds its own candidate provenance.",
    },
    {
      mode: "types",
      files: familyFixture(RECEIVING('import { VALUE } from "../lib/conditional-text.ts";\n'), {
        ...GATE_TYPE_HOME,
        "tooling/src/verify/lib/conditional-text.ts":
          'import type { ExemptionRow } from "../contract/gate.ts";\nexport const VALUE: ExemptionRow extends object ? string : ExemptionRow = "subject";',
      }),
      why: "ARM D CONDITIONAL OUTPUT — the checker resolves the output branch; a canonical condition or unselected branch is not received-value evidence. The paired row and text outputs discriminate this path.",
    },
  ],
});
