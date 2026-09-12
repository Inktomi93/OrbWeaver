// Policy: policy-soundness — the ERROR half of the §5b soundness enforcer (#1971; family `policy-soundness`,
// reader `lib/policy-descriptor-read.ts`). The gate corpus is the enforcement layer and, for FINAL modules,
// `lib/policy-validation.ts` proves only the SHAPE at load time — required fields, the workItem union, the
// facts/resources couplings. Nothing enforced §5b's closed classes until this family. This policy pins the
// three that are at ZERO today and must never regress, so a conversion lane copying a module cannot copy a
// defect the reading lanes already paid to remove:
//
//   E1 an inert `ext: ["ts","tsx"]` on a population (#1959) — `lib/policy-source-candidate.ts` pre-filters
//      every policy source to `.ts`/`.tsx`, so the full set is a no-op that teaches the next lane a field
//      means something. Swept to 0 at 8257071ee; a narrowing (`ext: ["tsx"]`) is LIVE and stays legal.
//   E2 final-contract residue — every code `lib/gate-contract.ts` reports on a module body (a ts-morph
//      walk, a gate-owned Project, module-scope `let`/mutation, a baseline ledger, a legacy descriptor
//      field, a descriptor spread or computed key). That reader already exists as the manual `pnpm
//      gate:contract` census, which is not a verify stage and is red by construction on the legacy corpus;
//      this arm runs it on the FINAL subset only, which is the half that can be on the commit bar today.
//   E3 an I/O or dynamic-loading door in a final module — §12.3 bans filesystem reads outright and the
//      closed ResourceHost vocabulary is the only door. The closed set (#2111 D1, each member its own row):
//      the `fs` / `node:fs` / `fs/promises` / `node:fs/promises` / `fs-extra` / `child_process` /
//      `node:child_process` specifiers, `_shared/proc.ts` (the subprocess home, judged by IMPORT ORIGIN),
//      a value-position `import(…)`, a `require(…)` call, and `process.binding(…)`. All at ZERO on the tree.
//   E4 a resource door read that does not go through `lib/resource-declaration.ts` `readyResourceValue`
//      (#2019). A declared resource is acquired and asserted READY in the population phase, and a non-ready
//      one withholds every consumer at the receipt phase — so a non-ready fact can never reach a policy, and
//      `readyResourceValue` is the ASSERTION of that guarantee. Answering a broken resource with a silent
//      `return` is unreachable code that teaches the next conversion a silent return is the right answer; the
//      law says so in `resource-declaration.ts`'s own JSDoc and in three module headers
//      (`client-structure.ts:18`, `server-layout.ts:27`, `ui-exports-map-complete.ts:35`), and NOTHING
//      enforced it. Censused 2026-09-12 at this lane's tip: every `ctx.resources.<door>(…)` in the gate
//      corpus is already wrapped, so the class is at ZERO and this arm holds it there. The ALIAS escape is the
//      same arm: `ctx.resources` in ANY position other than the receiver of a wrapped door call hands the
//      closed host to code this reader cannot follow.
//
//      A HAND-OFF EXCEPTION EXISTED HERE BETWEEN `bf9beb617` AND #2148, AND WAS REMOVED DELIBERATELY — it was
//      not lost in a refactor, and this paragraph exists so a reader who meets it in `git log` can tell. The
//      arm's first cut accused two CORRECT modules (`tsconfig-entry-liveness` and its `-health` sibling, which
//      handed the host to `lib/config-grant-rows.ts` (`readTsconfigRoster` as it then was) — a reader that narrowed it
//      correctly), caught by the family's real-corpus arm rather than by any fixture, and the repair was to
//      admit that one shape. THE CARVE HAD A HOLE IT COULD NOT SEE: this policy's population is
//      `tooling/src/verify/gates/**`, so the instant the closed host crossed into `lib/`, NOTHING policed what
//      happened to it — the guard stopped exactly where the escape began, and the next `lib/` reader had no
//      enforcer at all. #2148 ruled the stricter shape: readers take READY VALUES and the CALLER reads its own
//      door, so the host never leaves the call site and no exception is needed. The three live hand-offs were
//      inverted in the same commit (`lib/config-grant-rows.ts` `tsconfigRosterFrom` / `acquiredConfigText`).
//      An exception you have to keep proving safe is worse than one you do not need.
//   E6 a RETIRED marker grammar parsed in a final module (#2111 B8; `RETIRED_MARKER_OPENERS`, the §7 kind-1
//      and kind-3 vocabulary): a regex literal, a `new RegExp(<static text>)` or a `.includes/.startsWith/
//      .test/.exec/.indexOf` argument carrying `@orb-gate-ignore`, `FABRICATION-OK`, `@swallowed-ok`, … is a
//      PARSER of a grammar §12.5 retired — the private marker parser a conversion must delete, not carry.
//      Prose is not a parse: a `why`, a `message` or a `fix` naming the retired spelling is a MENTION (the
//      guide §7 census rule) and is acquitted. Zero on the tree, one row per opener.
//   E7 the `defineGate` argument is not a direct object literal (#2111 A42; §12.1 *"a direct
//      `defineGate({...})` object literal"*). Before this arm the whole family skipped such a module:
//      `finalDescriptorOf` returned `undefined` for `defineGate(DESCRIPTOR)` while the loader accepted it
//      (the brand is on the object it receives). The registration is now read through `finalRegistrationOf`,
//      E2's `inspectGateContract` runs on every canonical registration and its `descriptor-wrapper` code names
//      the shape; the field arms (E1, E4) still need the literal. Zero on the tree.
//
// RECORDED NON-ARMS, so nobody re-adds them: a declared-but-unread `facts:` entry is already REFUSED by the
// dispatcher (`lib/policy-pass.ts:703` "declared facts were not consumed" withholds the consumer), and
// `analysis: "syntax"` beside a `node.getType()` call is already `gate-modernization` ARM E (#1958); that arm
// joins this family when the legacy meta-gate retires. §5b criteria 2 and 5 and the §4.1 narrowing cut are
// judgment or mutation and stay with the reading lanes (family record:
// docs/reviews/gate-runtime/policy-soundness-family-1584.md).
//
// IDENTITY: a module is judged only when its `gate` initializer's callee resolves by IMPORT ORIGIN to
// `contract/policy.ts` — a legacy descriptor object and a local `defineGate` lookalike are out of scope
// (`gate-modernization` names the lookalike). BLINDNESS: this module is inside its own population, so when
// it is delivered and does not read as final the recognizer is dead and the run THROWS rather than reporting
// ✓ over the corpus forever (pinned through `runPolicyPass` in the family test).
import type { CallExpression, ImportDeclaration, Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { FinalRegistration } from "../contract/policy-descriptor-read.ts";
import { RETIRED_MARKER_OPENERS } from "../contract/policy-descriptor-read.ts";
import type { MemberRead } from "../contract/symbol-reference.ts";
import { inspectGateContract } from "../lib/gate-contract.ts";
import { bindsProvenNonModuleDeclaration } from "../lib/origin-verdict.ts";
import {
  bindsParameter,
  descriptorProperty,
  descriptorValue,
  finalRegistrationOf,
  objectLiteralOf,
  rootOf,
  stableTerminal,
  staticSegments,
  staticText,
} from "../lib/policy-descriptor-read.ts";
import { resolveModuleMemberOrigin } from "../lib/reference-fact.ts";
import { MEMBER_ACCESS_KINDS, readMemberAccess } from "../lib/symbol-reference.ts";
import {
  familyFixture,
  finalProbeModule,
  HARD_TRUNK,
  LIB_READER_PATH,
  LIB_READER_STUB,
  RESOURCE_DECLARATION_PATH,
  RESOURCE_DECLARATION_STUB,
  TS_MORPH_TYPES_PATH,
  TS_MORPH_TYPES_STUB,
} from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-soundness.ts";
/** E3's closed set of I/O doors by SPECIFIER — node builtins and the one npm filesystem wrapper have no import
 *  origin to resolve (a bare specifier is its own identity), so the spelling IS the door. */
const FORBIDDEN_IO_SPECIFIERS: ReadonlySet<string> = new Set([
  "fs",
  "node:fs",
  "fs/promises",
  "node:fs/promises",
  "fs-extra",
  "child_process",
  "node:child_process",
]);
/** E3's one door judged by IMPORT ORIGIN: the repo's subprocess home. A same-named module elsewhere is not it. */
const PROC_HOME = "/tooling/src/_shared/proc.ts";
const PROC_BASENAME = "proc.ts";
const REQUIRE = "require";
const PROCESS = "process";
const BINDING = "binding";
/** The membership/parse methods a private grammar is fed through (E6); `test`/`exec` on a regex receiver, the
 *  string methods on a text receiver — the ARGUMENT is what carries the opener in every one. */
const GRAMMAR_CALL_METHODS: ReadonlySet<string> = new Set(["includes", "startsWith", "test", "exec", "indexOf"]);
const LOADABLE_EXTENSIONS: ReadonlySet<string> = new Set(["ts", "tsx"]);
/** The ONE guarded door onto a declared resource, and the module that must declare it. The home is checked by
 *  IMPORT ORIGIN rather than by the callee's spelling: a local function of the same name asserts nothing, and
 *  a name-only test would ACQUIT it — the acquittal being the failure mode, not the accusation. */
const RESOURCE_GUARD = "readyResourceValue";
const RESOURCE_GUARD_HOME = "/tooling/src/verify/lib/resource-declaration.ts";
const RESOURCE_HOST_MEMBER = "resources";

const MESSAGE =
  "a final policy module carries something the final contract forbids (gate-runtime-standardization.md §3, §12.3): " +
  'an inert `ext: ["ts","tsx"]`, a ts-morph walk / gate-owned Project / module state / baseline ledger / legacy ' +
  "field, a `node:fs` import, or an unguarded resource-host read. The `ext` token names E1; a `[code]` suffix names the " +
  "`lib/gate-contract.ts` code; an `import` token names the filesystem door; a `resources` token names E4.";
const EXT_MESSAGE =
  '`ext: ["ts","tsx"]` is INERT — every policy source is already pre-filtered to .ts/.tsx (lib/policy-source-candidate.ts), ' +
  'so the full set declares nothing and teaches the next lane a no-op (#1959). Delete it; a narrowing (`ext: ["tsx"]`) is live and stays.';
const RESOURCE_MESSAGE =
  "a final policy reads the resource host without `readyResourceValue` (lib/resource-declaration.ts). A declared resource is asserted READY during the " +
  'population phase and a broken one withholds every consumer at the receipt phase, so an in-module `if (fact.status !== "ready") return;` is unreachable ' +
  "code that teaches the next conversion a silent return is the right answer to a broken resource. It is not. Wrap the door call, or — if the host is being " +
  "handed to something else — stop: the closed host may not leave the call site. A shared reader takes the NARROWED VALUE and the caller reads its own door (#2148).";
const FS_MESSAGE =
  "a final policy opens an I/O or dynamic-loading door — §12.3 bans every filesystem read and subprocess in a gate module (`fs`, `fs/promises`, " +
  "`fs-extra`, `child_process`, `_shared/proc.ts`, a value-position `import()`, `require()`, `process.binding()`); declare the read through the closed " +
  "ResourceHost vocabulary (contract/resource-declaration.ts) or STOP the conversion (a read no kind serves is a refusal, not a private door).";
const GRAMMAR_MESSAGE =
  "a final policy PARSES a retired marker grammar — a regex, a `new RegExp` or a membership test naming a `RETIRED_MARKER_OPENERS` spelling " +
  "(contract/policy-descriptor-read.ts). §12.5: a gate module receives no marker parser and the one waiver vocabulary is the central `@orb-waive`; " +
  "a private grammar carried across a conversion re-opens the door the conversion closed. A MENTION in prose is not a parse and is not this finding.";
const FIX =
  "E1: delete the `ext` field. E2: replace the walk with kind-indexed visitors / `ctx.files` / a shared `lib/` reader, move state into " +
  "`create`, retire the ledger into exact grants or warning debt, delete the legacy field, and hand `defineGate` a direct object literal (E7). " +
  "E3: delete the I/O door and declare a resource. E4: wrap the door in `readyResourceValue(ctx.resources.<door>(…))` imported from " +
  "`../lib/resource-declaration.ts`; never bind `ctx.resources` to a name and never pass it to a function — a shared `../lib/` reader takes the " +
  "NARROWED VALUE, read the door here and hand that over (#2148). E6: delete the private grammar; the central `@orb-waive` engine is the one parser.";
const BLIND =
  `BLINDNESS: ${SELF} is in the effective population and does not read as a final policy — the import-origin recognizer ` +
  "(lib/gate-contract-origin.ts isCanonicalDefineGate) is dead, so every module would read out of scope. Refusing the run.";

/** E1: the population's `ext` is exactly the full loadable set. */
function inertExtension(descriptor: ObjectLiteralExpression): MorphNode | undefined {
  const population = objectLiteralOf(descriptorValue(descriptor, "population"));
  const ext = population === undefined ? undefined : descriptorValue(population, "ext");
  const terminal = ext === undefined ? undefined : stableTerminal(ext);
  let anchor: MorphNode | undefined;
  if (population !== undefined && terminal !== undefined && Node.isArrayLiteralExpression(terminal)) {
    const members = new Set(terminal.getElements().map((element) => staticText(element)));
    if (members.size === LOADABLE_EXTENSIONS.size && [...LOADABLE_EXTENSIONS].every((extension) => members.has(extension))) {
      anchor = descriptorProperty(population, "ext") ?? population;
    }
  }
  return anchor;
}

/** E3: an import whose specifier is a forbidden I/O door, or whose ORIGIN is the subprocess home. The origin
 *  half fails closed inside its candidate set: a `proc.ts` specifier that resolves nowhere is reported. */
function isForbiddenIoImport(declaration: ImportDeclaration): boolean {
  const specifier = declaration.getModuleSpecifierValue();
  if (FORBIDDEN_IO_SPECIFIERS.has(specifier)) {
    return true;
  }
  if (specifier.slice(specifier.lastIndexOf("/") + 1) !== PROC_BASENAME) {
    return false;
  }
  const target = declaration.getModuleSpecifierSourceFile()?.getFilePath().replaceAll("\\", "/");
  return target === undefined || target.endsWith(PROC_HOME);
}

/** E3: a `process` receiver that is the Node global or the `node:process` import — never a local binding of the
 *  same name, which is somebody's data (the same discipline as E4's parameter test). Judged through the shared
 *  origin verdict (#2097): a `process` that PROVABLY binds a non-module declaration is data; the ambient global
 *  (no declaration in the project) and the import alias are the Node process. */
function isNodeProcess(receiver: MorphNode): boolean {
  return Node.isIdentifier(receiver) && receiver.getText() === PROCESS && !bindsProvenNonModuleDeclaration(receiver);
}

/** E3: a value-position `import(…)`, a `require(…)` call, or `process.binding(…)`. */
function isDynamicLoadingDoor(call: CallExpression): boolean {
  const callee = call.getExpression();
  if (callee.getKind() === SyntaxKind.ImportKeyword) {
    return true;
  }
  if (Node.isIdentifier(callee) && callee.getText() === REQUIRE) {
    return true;
  }
  // READ THROUGH THE SHARED RESOLVER, not `isPropertyAccessExpression` (#2199): `process["binding"](…)` is the
  // same door one node kind over, and a property-keyed check reads it as ordinary code.
  const read = readMemberAccess(callee);
  return read !== undefined && read.name === BINDING && isNodeProcess(read.receiver);
}

/** E6: the retired opener a piece of parser text carries, or undefined. */
function retiredOpenerIn(text: string): string | undefined {
  return RETIRED_MARKER_OPENERS.find((opener) => text.includes(opener));
}

/** E6: the first argument's static text when the call is a membership/parse method — the receiver is a regex or a
 *  string and the OPENER rides the argument (`text.includes("@orb-gate-ignore")`, `RE.test(line)` is judged at the
 *  regex literal instead). */
function grammarCallArgumentText(call: CallExpression): string | undefined {
  const read = readMemberAccess(call.getExpression());
  const argument = call.getArguments()[0];
  // `text["includes"]("@orb-gate-ignore")` parses the same grammar as `text.includes(…)` (#2199).
  if (read === undefined || !GRAMMAR_CALL_METHODS.has(read.name) || argument === undefined) {
    return;
  }
  return staticSegments(argument).segments.join("");
}

/** E6: the static text handed to `new RegExp(…)` — a grammar built from a string is still a grammar. */
function regExpConstructionText(construction: MorphNode): string | undefined {
  if (!Node.isNewExpression(construction) || construction.getExpression().getText() !== "RegExp") {
    return;
  }
  const argument = construction.getArguments()[0];
  return argument === undefined ? undefined : staticSegments(argument).segments.join("");
}

/** Is this `<identifier>.resources` a read of the CONTEXT host? The receiver must be a bare identifier
 *  declared as a PARAMETER, which is what a policy `create` context and a fact context both are — and what a
 *  local data object carrying its own `resources` field is not (the live near-miss is
 *  `devtools-frontend-assets.ts:103`, `assets.manifest.resources`, whose receiver is not an identifier at
 *  all). Anything reached through a longer receiver chain is somebody's data, not the closed host.
 *
 *  SPELLING-INDEPENDENT SINCE #2199: the read is resolved through `lib/symbol-reference.ts`, so
 *  `ctx["resources"]` is the same host read as `ctx.resources`. Keyed on `PropertyAccessExpression` alone,
 *  this arm — the one that decides whether a policy touched the resource host WITHOUT its guard — answered a
 *  silent no for the bracket spelling, which is a false clean on the accusing side. */
function contextResourceAccess(node: MorphNode): MemberRead | undefined {
  const read = readMemberAccess(node);
  return read !== undefined && read.name === RESOURCE_HOST_MEMBER && bindsParameter(read.receiver) ? read : undefined;
}

/** Is this callee THE guard — `readyResourceValue` resolved by import origin to its home module? Through the
 *  shared reader (#2097): the import-alias hop, a re-export and a namespace all resolve to the canonical project
 *  export; a same-named LOCAL function is not a module member and never resolves, which is the accusation. */
function isResourceGuard(callee: MorphNode): boolean {
  const fact = resolveModuleMemberOrigin(callee);
  if (fact.kind === "unresolved" || fact.value.memberPath.length > 0) {
    return false;
  }
  const { canonical } = fact.value;
  return (
    canonical.kind === "project" &&
    canonical.exportedName === RESOURCE_GUARD &&
    canonical.sourceFile.getFilePath().replaceAll("\\", "/").endsWith(RESOURCE_GUARD_HOME)
  );
}

/** The ONE admitted shape: `readyResourceValue(<ctx>.resources.<door>(…))`, with the guard resolved to its
 *  home module. Every other shape — a bare door call, a door call wrapped in something else, the host bound to
 *  a name, the host passed to ANY function, shared or local — answers true. There is no hand-off exception;
 *  the header records the one that existed and why it was removed. */
function unguardedResourceRead(access: MemberRead): boolean {
  const door = access.access.getParent();
  const doorRead = door === undefined ? undefined : readMemberAccess(door);
  // The DOOR is read through the same resolver as the host (#2199) — `ctx["resources"]["read"](…)` is one
  // admitted shape's spelling, and a property-keyed chain walk would have called it unguarded on the pass
  // side and invisible on the report side at once.
  if (door === undefined || doorRead === undefined || doorRead.receiver !== access.access) {
    return true;
  }
  const call = door.getParent();
  if (!Node.isCallExpression(call) || call.getExpression() !== door) {
    return true;
  }
  const guard = call.getParent();
  if (!Node.isCallExpression(guard) || guard.getArguments()[0] !== call) {
    return true;
  }
  return !isResourceGuard(guard.getExpression());
}

interface GrammarSite {
  readonly node: MorphNode;
  readonly opener: string;
}

interface JudgedModule {
  readonly sourceFile: SourceFile;
  readonly path: string;
  readonly registration: FinalRegistration;
  readonly ioDoors: readonly MorphNode[];
  readonly resourceReads: readonly MemberRead[];
  readonly grammarSites: readonly GrammarSite[];
}

/** The arms over ONE final module. E2 (which names the E7 shape) runs on every registration; the field arm E1
 *  needs the descriptor literal and is skipped — not acquitted — when there is none, because E2 has already
 *  reported the module for the shape that makes its fields unreadable. */
function judgeModule(ctx: GatePolicyContext, { sourceFile, path, registration, ioDoors, resourceReads, grammarSites }: JudgedModule): void {
  const ext = registration.descriptor === undefined ? undefined : inertExtension(registration.descriptor);
  if (ext !== undefined) {
    ctx.report.node(ext, Node.isPropertyAssignment(ext) ? { token: "ext", offset: 0, message: EXT_MESSAGE } : { message: EXT_MESSAGE });
  }
  for (const finding of inspectGateContract([sourceFile], rootOf(sourceFile, path)).findings) {
    ctx.report.file(path, { line: finding.line, column: finding.column, message: `${finding.detail} [${finding.code}]` });
  }
  for (const door of ioDoors) {
    ctx.report.node(door, { message: FS_MESSAGE });
  }
  for (const access of resourceReads) {
    ctx.report.node(access.nameNode, { message: RESOURCE_MESSAGE });
  }
  for (const site of grammarSites) {
    ctx.report.node(site.node, { message: `${GRAMMAR_MESSAGE} Opener: ${site.opener}.` });
  }
}

export const gate = defineGate({
  id: "policy-soundness",
  family: "policy-soundness",
  authority: "hard",
  severity: "error",
  // The LOADER's corpus: top-level gate modules; `_proof/` holds shared fixture surfaces, never a descriptor.
  population: { in: ["@tooling"], under: ["tooling/src/verify/gates/**"], notUnder: ["tooling/src/verify/gates/_proof/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const ioDoors = new Map<SourceFile, MorphNode[]>();
    const resourceReads = new Map<SourceFile, MemberRead[]>();
    const grammarSites = new Map<SourceFile, GrammarSite[]>();
    const noteDoor = (sourceFile: SourceFile, node: MorphNode): void => {
      ioDoors.set(sourceFile, [...(ioDoors.get(sourceFile) ?? []), node]);
    };
    const noteGrammar = (sourceFile: SourceFile, node: MorphNode, text: string | undefined): void => {
      const opener = text === undefined ? undefined : retiredOpenerIn(text);
      if (opener !== undefined) {
        grammarSites.set(sourceFile, [...(grammarSites.get(sourceFile) ?? []), { node, opener }]);
      }
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration],
          visit: (node, sourceFile): void => {
            if (Node.isImportDeclaration(node) && isForbiddenIoImport(node)) {
              noteDoor(sourceFile, node);
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            if (isDynamicLoadingDoor(node)) {
              noteDoor(sourceFile, node);
            }
            noteGrammar(sourceFile, node, grammarCallArgumentText(node));
          },
        },
        {
          kinds: [SyntaxKind.RegularExpressionLiteral, SyntaxKind.NewExpression],
          visit: (node, sourceFile): void => {
            noteGrammar(sourceFile, node, Node.isRegularExpressionLiteral(node) ? node.getText() : regExpConstructionText(node));
          },
        },
        {
          // BOTH member kinds (#2199): `MEMBER_ACCESS_KINDS` is the whole family of member-read spellings, and
          // subscribing to the property half alone is the #1506 hole this arm was shipping.
          kinds: [...MEMBER_ACCESS_KINDS],
          visit: (node, sourceFile): void => {
            const read = contextResourceAccess(node);
            if (read !== undefined && unguardedResourceRead(read)) {
              resourceReads.set(sourceFile, [...(resourceReads.get(sourceFile) ?? []), read]);
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const sourceFile of ctx.files) {
          const path = ctx.relativePath(sourceFile);
          const registration = finalRegistrationOf(sourceFile);
          if (registration !== undefined) {
            judgeModule(ctx, {
              sourceFile,
              path,
              registration,
              ioDoors: ioDoors.get(sourceFile) ?? [],
              resourceReads: resourceReads.get(sourceFile) ?? [],
              grammarSites: grammarSites.get(sourceFile) ?? [],
            });
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
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ).replace('population: "@client"', 'population: { in: ["@client"], ext: ["ts", "tsx"] }'),
      ),
      expect: { count: 1, token: "ext", messageIncludes: "INERT" },
      why: "E1 founding shape (#1959): the full loadable set on a population declares nothing — the token is the field, because deleting it is the repair",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ).replace('population: "@client"', 'population: { in: ["@client"], ext: ["tsx", "ts"] }'),
      ),
      expect: { count: 1, token: "ext" },
      why: "E1 is a SET test, not a spelling test — the two members in the other order are the same inert declaration",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ visitFile: (sourceFile: SourceFile) => sourceFile.forEachDescendant(() => undefined) }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import type { SourceFile } from "ts-morph";\n',
        ),
        { [TS_MORPH_TYPES_PATH]: TS_MORPH_TYPES_STUB },
      ),
      expect: { count: 1, messageIncludes: "[direct-walk]" },
      why: "E2 the founding residue: a direct ts-morph walk on a receiver TYPED by ts-morph — `lib/gate-contract.ts` proves the walk through the declaration's origin, not the member's spelling, and this arm re-anchors its verdict on the module",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => { const project = new Project(); return project; } }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { Project } from "ts-morph";\n',
        ),
        { [TS_MORPH_TYPES_PATH]: TS_MORPH_TYPES_STUB },
      ),
      expect: { count: 1, messageIncludes: "[gate-owned-project]" },
      why: "E2 a gate-owned Project — the workspace cache §12.3 forbids, resolved to the ts-morph export through the module-origin reader",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => count }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "let count = 0;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "[module-let]" },
      why: "E2 module-scope state — `create` is the only allocation site the contract admits; a module `let` survives across invocations and re-entry (read only here, so the declaration is the ONE finding)",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => { seen.add("x"); } }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const seen = new Set<string>();\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "[module-mutation]" },
      why: "E2 a module-scope CONST collection mutated from a hook is the same cross-invocation state wearing `const` — the reader proves the mutator through its lib declaration (`Set#add`), not its spelling",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: LEDGER,\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'const LEDGER = "tooling/src/verify/gates/probe.baseline.json";\n',
        ),
      ),
      expect: { count: 1, messageIncludes: "[baseline-ledger]" },
      why: "E2 a baseline ledger path in a final module — §12.5 retires count ratchets into exact grants or warning debt",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  run: () => undefined,\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ),
      ),
      expect: { count: 1, messageIncludes: "[legacy-field]" },
      why: "E2 a legacy hook on a final descriptor — half a migration is the rot; the loader refuses it and this arm names the field",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => { readFileSync("x"); } }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { readFileSync } from "node:fs";\n',
        ),
      ),
      expect: { count: 1, token: "import", messageIncludes: "opens an I/O" },
      why: "E3 the filesystem door: a `node:fs` import in a final module is a private resource reader wearing a contract's clothes (§12.4) — the import declaration is the anchor because deleting it is the repair",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ evaluate: () => { ctx["resources"]["trackedFiles"](); } }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ),
      ),
      expect: { count: 1, token: '"resources"', messageIncludes: "without `readyResourceValue`" },
      why: 'E4 THE BRACKET SPELLING (#2199) — `ctx["resources"]["trackedFiles"]()` is the same unguarded host read, and the arm was keyed on `PropertyAccessExpression` at BOTH ends (the host read and the walk subscription), so it produced no node to judge at all. Measured on the unmodified module: 0 findings. The token is the quoted key because that is the authored text at the reported position',
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ evaluate: () => { ctx.resources.trackedFiles(); } }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ),
      ),
      expect: { count: 1, token: "resources", messageIncludes: "without `readyResourceValue`" },
      why: "E4 the founding shape (#2019): a bare door call. The declared resource was already asserted READY during the population phase and a broken one withholds every consumer at the receipt phase, so the only thing an unwrapped read can grow is an in-module non-ready branch — unreachable code that teaches the next conversion a silent return answers a broken resource",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ evaluate: () => { const host = ctx.resources; return host; } }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ),
      ),
      expect: { count: 1, token: "resources", messageIncludes: "may not leave the call site" },
      why: "E4 the ALIAS escape, the same defect one hop out: the closed host bound to a name leaves the call site and nothing downstream of that binding can be proven to wrap anything. Without this arm the founding row is evadable by one `const`",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ evaluate: () => { readyResourceValue(ctx.resources.trackedFiles()); } }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "function readyResourceValue<T>(fact: T): T {\n  return fact;\n}\n",
        ),
      ),
      expect: { count: 1, token: "resources" },
      why: "E4 IDENTITY, not spelling — the DISCRIMINATION control for the admitted row below. A LOCAL function named `readyResourceValue` asserts nothing about the runtime guarantee, and a name-only test would ACQUIT it. An acquittal is the failure mode this arm cannot afford, so the guard is resolved to its declaring module",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ evaluate: () => { readProbeRoster(ctx.resources); } }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "function readProbeRoster(resources: unknown): unknown {\n  return resources;\n}\n",
        ),
      ),
      expect: { count: 1, token: "resources" },
      why: "E4 THE GENERAL ESCAPE: the host handed to a LOCAL function. This row predates the #2148 ruling and survives it unchanged — it is about handing the host to code at all, independent of where that code lives, which is why it stayed valuable when the shared-reader carve beside it was retired",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ evaluate: () => { readProbeRoster(ctx.resources); } }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { readProbeRoster } from "../lib/probe-reader.ts";\n',
        ),
        { [LIB_READER_PATH]: LIB_READER_STUB, [RESOURCE_DECLARATION_PATH]: RESOURCE_DECLARATION_STUB },
      ),
      expect: { count: 1, token: "resources" },
      why: "E4 THE RETIRED CARVE, ON THE BYTES IT USED TO ADMIT (#2148). Between `bf9beb617` and the ruling this exact fixture was a `mustPass`: the host handed whole to an IMPORTED `lib/` reader that narrows it itself. It is now an accusation, deliberately on the same bytes rather than deleted — a removed exception otherwise leaves an ABSENCE, and an absence cannot tell a later reader whether the carve was closed or never existed. The carve's hole: this policy's population is the gates tree, so once the host crossed into `lib/` nothing policed it, and that reader narrowing correctly was luck the next one would not inherit. The live hand-offs were inverted in the same commit",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { readFileSync } from "fs";\n',
        ),
      ),
      expect: { count: 1, token: "import", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER `fs` — the bare builtin specifier is the same door as `node:fs`",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { readFile } from "fs/promises";\n',
        ),
      ),
      expect: { count: 1, token: "import", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER `fs/promises` — the promise-returning filesystem, same door",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { readFile } from "node:fs/promises";\n',
        ),
      ),
      expect: { count: 1, token: "import", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER `node:fs/promises`",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { readJson } from "fs-extra";\n',
        ),
      ),
      expect: { count: 1, token: "import", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER `fs-extra` — the npm wrapper over the same filesystem (#2111 D1)",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { execFileSync } from "child_process";\n',
        ),
      ),
      expect: { count: 1, token: "import", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER `child_process` — a subprocess is a filesystem read by proxy and a git shell is the §12.4 residual-1 door",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { execFileSync } from "node:child_process";\n',
        ),
      ),
      expect: { count: 1, token: "import", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER `node:child_process`",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { runNicedSync } from "../../_shared/proc.ts";\n',
        ),
        { "tooling/src/_shared/proc.ts": "export const runNicedSync = 1;\n" },
      ),
      expect: { count: 1, token: "import", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER `_shared/proc.ts` — the subprocess home, judged by IMPORT ORIGIN: the planted target makes the specifier resolve to the real home suffix",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { runNicedSync } from "../../_shared/proc.ts";\n',
        ),
      ),
      expect: { count: 1, token: "import", messageIncludes: "opens an I/O" },
      why: "E3 FAIL-CLOSED: a `proc.ts` specifier that resolves NOWHERE is reported — the origin cannot be established, and acquitting it on its spelling would be the failure mode (#944)",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'export async function load(): Promise<unknown> {\n  return import("./sibling.ts");\n}\n',
        ),
      ),
      expect: { count: 1, token: "import", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER value-position `import(…)` — a dynamic import is a loader a policy reaches at run time, outside every static reader",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'declare function require(id: string): unknown;\nexport const loaded = require("fs");\n',
        ),
      ),
      expect: { count: 1, token: "require", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER `require(…)` — the CommonJS door smuggled into an ESM module",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'export const bound = process.binding("fs");\n',
        ),
      ),
      expect: { count: 1, token: "process", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER `process.binding(…)` on the Node global (no declaration in the proof project, exactly as no `@types/node` ships to a policy)",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import process from "node:process";\nexport const bound = process.binding("fs");\n',
        ),
      ),
      expect: { count: 1, token: "process", messageIncludes: "opens an I/O" },
      why: "E3 MEMBER `process.binding(…)` through the `node:process` import — the receiver's declaration is an import, not a local binding",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@orb-gate-ignore/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @orb-gate-ignore." },
      why: "E6 MEMBER `@orb-gate-ignore` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@foreign-id-ok/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @foreign-id-ok." },
      why: "E6 MEMBER `@foreign-id-ok` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@owner-scope-ok/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @owner-scope-ok." },
      why: "E6 MEMBER `@owner-scope-ok` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@owner-scope-write-ok/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @owner-scope-write-ok." },
      why: "E6 MEMBER `@owner-scope-write-ok` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@owner-scope-upsert-ok/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @owner-scope-upsert-ok." },
      why: "E6 MEMBER `@owner-scope-upsert-ok` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@nullable-cmp-ok/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @nullable-cmp-ok." },
      why: "E6 MEMBER `@nullable-cmp-ok` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@sub-floor-ok/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @sub-floor-ok." },
      why: "E6 MEMBER `@sub-floor-ok` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@swallowed-ok/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @swallowed-ok." },
      why: "E6 MEMBER `@swallowed-ok` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@surface-focus-elsewhere/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @surface-focus-elsewhere." },
      why: "E6 MEMBER `@surface-focus-elsewhere` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@finding-overload-ok/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @finding-overload-ok." },
      why: "E6 MEMBER `@finding-overload-ok` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@first-boot-only/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @first-boot-only." },
      why: "E6 MEMBER `@first-boot-only` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@over-art-plate-ok/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @over-art-plate-ok." },
      why: "E6 MEMBER `@over-art-plate-ok` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /@column-ok/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @column-ok." },
      why: "E6 MEMBER `@column-ok` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /FABRICATION-OK/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: FABRICATION-OK." },
      why: "E6 MEMBER `FABRICATION-OK` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /ONESHOT-OK/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: ONESHOT-OK." },
      why: "E6 MEMBER `ONESHOT-OK` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const GRAMMAR = /PROSE-OK/u;\n",
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: PROSE-OK." },
      why: "E6 MEMBER `PROSE-OK` parsed by a regex literal in a final module — one row per retired opener, so a spelling the reader stops matching cannot go silent behind its siblings",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'const GRAMMAR = new RegExp("^\\\\s*//\\\\s*@orb-gate-ignore");\n',
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: @orb-gate-ignore." },
      why: "E6 the `new RegExp(<static text>)` shape — a grammar built from a string is still a grammar; the argument is read through the static-segment reader",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'export const marked = (line: string): boolean => line.includes("FABRICATION-OK");\n',
        ),
      ),
      expect: { count: 1, messageIncludes: "Opener: FABRICATION-OK." },
      why: "E6 the membership-test shape — `.includes/.startsWith/.test/.exec/.indexOf` with the opener as its argument is a parser without a regex",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        )
          .replace("export const gate = defineGate({", "const DESCRIPTOR = {")
          .replace("\n});\n", "\n};\nexport const gate = defineGate(DESCRIPTOR);\n"),
      ),
      expect: { count: 1, messageIncludes: "[descriptor-wrapper]" },
      why: "E7 THE BLIND SPOT, CLOSED (#2111 A42): `defineGate(DESCRIPTOR)` is a registration the loader brands and every field arm of this family used to skip — `finalDescriptorOf` read `undefined` and the module was judged by nobody. E2 now runs on the REGISTRATION and its `descriptor-wrapper` code names the non-literal argument; red-first on the pre-fix family: 0 findings",
    },
  ],
  // A refusal is the CORRECT outcome for an input that breaks a runtime guarantee, and no `mustFlag`/`mustPass`
  // row can hold one: `toolFailure` runs before the arm verdict, so such a row is neither (guide §4.5b, #1977).
  mustRefuse: [
    {
      mode: "types",
      files: { [SELF]: 'export const gate = { id: "policy-soundness", message: "m" };\n' },
      expect: { messageIncludes: "BLINDNESS" },
      why: "THE BLINDNESS TRIPWIRE, FIRED. This module sits inside its own population, so if the import-origin recognizer ever dies every module reads out of scope and the family renders a clean corpus forever. The fixture is this module's OWN path carrying a descriptor the recognizer does not admit; the run must REFUSE rather than report zero. Constructing it also answers whether the property is falsifiable — it is, in one file, which is why this is a row and not a paragraph",
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
      why: "a clean final module: no ext, no residue, no filesystem — the ordinary shape of the converted corpus",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ evaluate: () => readyResourceValue(ctx.resources.trackedFiles()) }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { readyResourceValue } from "../lib/resource-declaration.ts";\n',
        ),
        { [RESOURCE_DECLARATION_PATH]: RESOURCE_DECLARATION_STUB },
      ),
      why: "E4 the ADMITTED shape, and the row that dies first if the arm over-reaches: the guard imported from its home module. Every resource read in the live gate corpus already takes this shape, which is what lands the arm on a fixed tree",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => assets.manifest.resources.length }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const assets = { manifest: { resources: [1] } };\n",
        ),
      ),
      why: "E4 NEAR-MISS, taken from the live tree (`devtools-frontend-assets.ts:103` reads `assets.manifest.resources.length`): a `.resources` DATA field is not the closed host. The arm is keyed on a bare-identifier receiver declared as a PARAMETER, which a context is and a local object is not",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ).replace('population: "@client"', 'population: { in: ["@client"], ext: ["tsx"] }'),
      ),
      why: 'E1 NEAR-MISS: `ext: ["tsx"]` is a real narrowing (it empties a .ts-only population) and stays legal — the arm is about the FULL set, never the field',
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ visitors: [{ kinds: [1], visit: (node: Node) => node.getSourceFile() }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import type { Node } from "ts-morph";\n',
        ),
        { [TS_MORPH_TYPES_PATH]: TS_MORPH_TYPES_STUB },
      ),
      why: "E2 DECLARED LIMIT inherited from the reader: `getSourceFile` on a NODE is the delivered node's own file, not a Project walk — `isTsMorphWalk` admits it, so this arm does too",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'const process = { binding: (name: string): string => name };\nexport const bound = process.binding("fs");\n',
        ),
      ),
      why: "E3 NEAR-MISS: a LOCAL binding named `process` is somebody's data, not the Node global — the receiver test reads the declaration, never the spelling",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'export function calleeName(call: import("ts-morph").CallExpression): string {\n  return call.getText();\n}\n',
        ),
      ),
      why: 'E3 NEAR-MISS: a TYPE-position `import("ts-morph")` is an `ImportType` node, not a dynamic import — three live modules use it and none opens a door',
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { runNicedSync } from "./proc.ts";\n',
        ),
        { "tooling/src/verify/gates/proc.ts": "export const runNicedSync = 1;\n" },
      ),
      why: "E3 IDENTITY, NOT SPELLING: a sibling `gates/proc.ts` shares the basename and resolves to an unrelated path — acquitted by its resolved suffix",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import { dirname } from "node:path";\nexport const home = dirname("a/b");\n',
        ),
      ),
      why: "E3 NEAR-MISS: `node:path` is pure string arithmetic, not a door — the one Node builtin a live final module imports (`test-presence-client`)",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          "const LIVE = /^[ \\t]*\\/\\/[ \\t]*@orb-waive /u;\n",
        ),
      ),
      why: "E6 NEAR-MISS: the LIVE central grammar `@orb-waive` in a regex is not a retired opener — the family reader itself carries one (lib/policy-descriptor-read.ts), and the arm is about the retired set",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'const WHY = "the legacy grammar was @orb-gate-ignore and FABRICATION-OK; both are retired";\n',
        ),
      ),
      why: "E6 NEAR-MISS (guide §7): a retired spelling in PROSE — a `why`, a header, a `fix` — is a MENTION, never a parse; only a regex, a `new RegExp` or a membership test names a grammar",
    },
    {
      mode: "types",
      files: familyFixture('export const gate = { name: "probe", docRow: "x", message: "m", run: () => undefined, mustFlag: [1], mustPass: [1] };\n'),
      why: "SCOPE: a LEGACY descriptor object registers under the other contract and is judged by its own runtime — this family never reads it, whatever hooks it carries",
    },
    {
      mode: "types",
      files: familyFixture(
        'function defineGate(policy: unknown): unknown {\n  return policy;\n}\nexport const gate = defineGate({ id: "probe", population: { in: ["@client"], ext: ["ts", "tsx"] } });\n',
      ),
      why: "IDENTITY, not spelling: a same-named LOCAL `defineGate` has no import origin in contract/policy.ts, registers nothing, and is out of scope even with an inert ext — `gate-modernization` ARM A names the lookalike",
    },
    {
      mode: "types",
      files: familyFixture(
        'import { readFileSync } from "node:fs";\nexport const gate = { name: "probe", docRow: "x", message: "m", run: () => readFileSync("x"), mustFlag: [1], mustPass: [1] };\n',
      ),
      why: "E3 SCOPE control: a legacy descriptor may read the filesystem (its `fsBacked` arm is that runtime's contract) — the ban binds the FINAL contract only",
    },
  ],
});
