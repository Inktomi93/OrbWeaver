// Policy: policy-legacy-imports — a FINAL module's IMPORT DOORS are judged by where they RESOLVE (#2111, #2096;
// family `policy-soundness`, readers `lib/policy-descriptor-read.ts` for both registrations and
// `lib/gate-contract-origin.ts`'s import-origin discipline for the identity). Two arms, one visitor:
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
//   B ANOTHER GATE MODULE (§12.3, owner ruling #2096, 2026-09-12: *"a gate module never imports another gate
//     module; shared predicates move to `lib/<family>.ts`"*). A `-health` sibling reading its twin's exports was
//     two homes for one reader wearing a family's clothes, and thirteen final modules do it at this arm's landing
//     (lane `p-family-readers` migrates them by module). The predicate is NOT the directory: `gates/_proof/**`
//     holds shared proof surfaces that register nothing (`persist-partialize-and-total-migrate` imports
//     `./_proof/zustand.ts` by right, guide §6.5), so the arm resolves the specifier and asks the loader's own
//     question of the TARGET — does it register under either contract (`gateRegistrationOf`)? A module that does
//     is a gate module wherever it sits; a module that does not is a surface, a reader or a helper.
//
// THE CANDIDATE SETS, per arm, with the `lib/origin-verdict.ts` discipline (identity, not spelling; fail closed
// only inside the candidate set):
//   A a specifier whose BASENAME is a forbidden home's — the identity is the RESOLVED path's suffix in
//     `FORBIDDEN_IMPORT_HOMES`: `contract/gate.ts` (`ExemptionTable`, `ExemptionRow`, `Finding`, `GateDescriptor`,
//     `GateRunCtx`, `GateExample`), `lib/pass.ts` (the legacy dispatcher), `lib/gate-ignore.ts` (the legacy
//     `@orb-gate-ignore` parser, §7 kind 1), `lib/reviewed-grants.ts` (the grant table), `lib/ordinary-waiver.ts`
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
//   `../ops/debt.ts` is B and C. A specifier in NONE of them is never resolved at all, which is what keeps
//   `react` and `ts-morph` out of the accusation — but a `../lib/` reader IS a candidate (it is relative), IS
//   resolved, and is acquitted by its TARGET: it names no forbidden home, sits under no forbidden prefix, and
//   registers no gate. Acquittal by identity, never by never being looked at.
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
import type { ExportDeclaration, ImportDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateContractKind } from "../contract/gate-corpus.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { finalRegistrationOf, gateRegistrationOf } from "../lib/policy-descriptor-read.ts";
import { familyFixture, finalProbeModule, HARD_TRUNK } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-legacy-imports.ts";

/** ARM A's closed set, as REPO-RELATIVE suffixes the resolved path is judged by. Each member has its own row. */
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
  "a FINAL policy module imports the legacy descriptor contract or the central authority machinery (gate-runtime-standardization.md §5, §9): " +
  "`contract/gate.ts` (ExemptionTable/ExemptionRow/Finding/GateDescriptor), the legacy dispatcher or marker parser, the grant table, the waiver " +
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
  "a FINAL policy module imports a candidate specifier that resolves to NOTHING — a basename in the forbidden-home set (`gate.ts`, `pass.ts`, " +
  "`gate-ignore.ts`, `reviewed-grants.ts`, `ordinary-waiver.ts`, `gate-authority.ts`, `policy-pass.ts`, `loader.ts`, `policy-loader.ts`) or a " +
  "relative path that could name a sibling gate module. The import origin CANNOT be established, so the module is reported rather than " +
  "acquitted on the strength of a spelling (#944 fail-closed).";
const FIX =
  "ARM A: migrate the exemption table to exact reviewed grants (#1922, §12.5), replace a `Finding`-typed helper with `ctx.report.node`/`ctx.report.file`, " +
  "and delete every import of the legacy or central machinery; a final module reads only `contract/*` and the shared `lib/` readers. " +
  "ARM B: move the shared predicate to `lib/<family>.ts` and import it there from BOTH modules (#2096); debt data with one owner (a deferral " +
  "list) moves to `contract/` or `lib/` the same way — the sibling never becomes the home.";
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
  if (!isCandidateSpecifier(specifier)) {
    return;
  }
  const target = door.getModuleSpecifierSourceFile();
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
  return contract === undefined ? launderedThrough(target, new Set()) : { kind: "sibling-gate", contract, target: displayPath(path) };
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
  // ONE TAIL RETURN (`lib/pass.ts`'s accumulator idiom): `biome`'s `noUselessUndefined` deletes a trailing
  // `return undefined;` and tsc's `noImplicitReturns` then reds the fall-through.
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
/** A value import of a sibling's export, the live shape (thirteen modules at landing). */
const IMPORTING_VALUE = (specifier: string, named: string): string =>
  finalProbeModule(
    `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
    `import { ${named} } from "${specifier}";\n`,
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
      files: familyFixture(IMPORTING("../contract/gate.ts", "ExemptionTable"), TARGET("tooling/src/verify/contract/gate.ts", "ExemptionTable")),
      expect: { count: 1, token: '"../contract/gate.ts"', messageIncludes: "Resolved home: tooling/src/verify/contract/gate.ts" },
      why: "ARM A THE FOUNDING SHAPE and the live class (nine modules at mint): the legacy `ExemptionTable` carried behind `defineGate` — the position is the specifier, because deleting the import is the repair",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/pass.ts", "PassResult"), TARGET("tooling/src/verify/lib/pass.ts", "PassResult")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/pass.ts" },
      why: "ARM A MEMBER `lib/pass.ts` — the legacy dispatcher; a final module that reaches it runs a pass of its own",
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
      why: "ARM B THE FOUNDING SHAPE (#2096) and the live class (thirteen modules at landing): a value import of a sibling FINAL gate's export — `owner-scoped-reads` reading `table-scoping-class`'s idents, `bus-producer-coverage` reading `user-bus-deferred-member`'s deferral list. The target REGISTERS (a canonical `defineGate` through the planted contract), which is the whole predicate",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING_VALUE("./legacy-sibling.ts", "SANCTIONED"), { [LEGACY_SIBLING_PATH]: LEGACY_SIBLING }),
      expect: { count: 1, token: '"./legacy-sibling.ts"', messageIncludes: "a legacy gate module" },
      why: "ARM B the LEGACY contract registers too (the loader's rule 2, a `gate` descriptor object): `playwright-css-topology` reads `sanctioned-css-homes`' table, a legacy module. Either contract is a gate module; the arm names which",
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
  ],
  mustRefuse: [
    {
      mode: "types",
      files: { [SELF]: 'export const gate = { id: "policy-legacy-imports", message: "m" };\n' },
      expect: { messageIncludes: "BLINDNESS" },
      why: "THE BLINDNESS TRIPWIRE, FIRED: this module's own path carrying a descriptor the recognizer does not admit must REFUSE, never report a clean corpus",
    },
  ],
  mustPass: [
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
  ],
});
