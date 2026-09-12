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
//   E3 a `node:fs` import in a final module — §12.3 bans filesystem reads outright; the closed
//      ResourceHost vocabulary is the only door.
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
import type { ImportDeclaration, Node as MorphNode, ObjectLiteralExpression, PropertyAccessExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { inspectGateContract } from "../lib/gate-contract.ts";
import { descriptorProperty, descriptorValue, finalDescriptorOf, objectLiteralOf, rootOf, stableTerminal, staticText } from "../lib/policy-descriptor-read.ts";
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
const FS_MODULE_RE = /^(?:node:)?fs(?:\/promises)?$/u;
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
  "a final policy imports the filesystem — §12.3 bans every filesystem read in a gate module; declare the read through the closed " +
  "ResourceHost vocabulary (contract/resource-declaration.ts) or STOP the conversion (a read no kind serves is a refusal, not a private door).";
const FIX =
  "E1: delete the `ext` field. E2: replace the walk with kind-indexed visitors / `ctx.files` / a shared `lib/` reader, move state into " +
  "`create`, retire the ledger into exact grants or warning debt, delete the legacy field. E3: delete the `node:fs` import and declare a resource. " +
  "E4: wrap the door in `readyResourceValue(ctx.resources.<door>(…))` imported from `../lib/resource-declaration.ts`; never bind `ctx.resources` to a name and never pass it to a function. A shared `../lib/` reader takes the NARROWED VALUE — read the door here and hand that over.";
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

/** Is this `<identifier>.resources` a read of the CONTEXT host? The receiver must be a bare identifier
 *  declared as a PARAMETER, which is what a policy `create` context and a fact context both are — and what a
 *  local data object carrying its own `resources` field is not (the live near-miss is
 *  `devtools-frontend-assets.ts:103`, `assets.manifest.resources`, whose receiver is not an identifier at
 *  all). Anything reached through a longer receiver chain is somebody's data, not the closed host. */
function isContextResourceAccess(node: MorphNode): node is PropertyAccessExpression {
  if (!Node.isPropertyAccessExpression(node) || node.getName() !== RESOURCE_HOST_MEMBER) {
    return false;
  }
  const receiver = node.getExpression();
  return Node.isIdentifier(receiver) && (receiver.getSymbol()?.getDeclarations() ?? []).some((declaration) => Node.isParameterDeclaration(declaration));
}

/** The declarations a callee identifier resolves to, following the IMPORT ALIAS. An imported name binds to an
 *  alias symbol whose declaration is the import specifier in THIS file, so without the hop every imported
 *  callee reads as local — which is an ACQUITTAL for the guard and an ACCUSATION for the shared reader. */
function calleeDeclarations(callee: MorphNode): readonly MorphNode[] {
  if (!Node.isIdentifier(callee)) {
    return [];
  }
  const symbol = callee.getSymbol();
  return symbol === undefined ? [] : (symbol.getAliasedSymbol() ?? symbol).getDeclarations();
}

function declaredUnder(declarations: readonly MorphNode[], home: string): boolean {
  return declarations.some((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").includes(home));
}

/** The ONE admitted shape: `readyResourceValue(<ctx>.resources.<door>(…))`, with the guard resolved to its
 *  home module. Every other shape — a bare door call, a door call wrapped in something else, the host bound to
 *  a name, the host passed to ANY function, shared or local — answers true. There is no hand-off exception;
 *  the header records the one that existed and why it was removed. */
function unguardedResourceRead(access: PropertyAccessExpression): boolean {
  const door = access.getParent();
  if (!Node.isPropertyAccessExpression(door) || door.getExpression() !== access) {
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
  const callee = guard.getExpression();
  if (!Node.isIdentifier(callee) || callee.getText() !== RESOURCE_GUARD) {
    return true;
  }
  return !declaredUnder(calleeDeclarations(callee), RESOURCE_GUARD_HOME);
}

interface JudgedModule {
  readonly sourceFile: SourceFile;
  readonly path: string;
  readonly descriptor: ObjectLiteralExpression;
  readonly fsImports: readonly ImportDeclaration[];
  readonly resourceReads: readonly PropertyAccessExpression[];
}

/** The three arms over ONE final module. */
function judgeModule(ctx: GatePolicyContext, { sourceFile, path, descriptor, fsImports, resourceReads }: JudgedModule): void {
  const ext = inertExtension(descriptor);
  if (ext !== undefined) {
    ctx.report.node(ext, Node.isPropertyAssignment(ext) ? { token: "ext", offset: 0, message: EXT_MESSAGE } : { message: EXT_MESSAGE });
  }
  for (const finding of inspectGateContract([sourceFile], rootOf(sourceFile, path)).findings) {
    ctx.report.file(path, { line: finding.line, column: finding.column, message: `${finding.detail} [${finding.code}]` });
  }
  for (const declaration of fsImports) {
    ctx.report.node(declaration, { message: FS_MESSAGE });
  }
  for (const access of resourceReads) {
    ctx.report.node(access.getNameNode(), { message: RESOURCE_MESSAGE });
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
    const fsImports = new Map<SourceFile, ImportDeclaration[]>();
    const resourceReads = new Map<SourceFile, PropertyAccessExpression[]>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration],
          visit: (node, sourceFile): void => {
            if (Node.isImportDeclaration(node) && FS_MODULE_RE.test(node.getModuleSpecifierValue())) {
              fsImports.set(sourceFile, [...(fsImports.get(sourceFile) ?? []), node]);
            }
          },
        },
        {
          kinds: [SyntaxKind.PropertyAccessExpression],
          visit: (node, sourceFile): void => {
            if (isContextResourceAccess(node) && unguardedResourceRead(node)) {
              resourceReads.set(sourceFile, [...(resourceReads.get(sourceFile) ?? []), node]);
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const sourceFile of ctx.files) {
          const path = ctx.relativePath(sourceFile);
          const descriptor = finalDescriptorOf(sourceFile);
          if (descriptor !== undefined) {
            judgeModule(ctx, {
              sourceFile,
              path,
              descriptor,
              fsImports: fsImports.get(sourceFile) ?? [],
              resourceReads: resourceReads.get(sourceFile) ?? [],
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
      expect: { count: 1, token: "import", messageIncludes: "imports the filesystem" },
      why: "E3 the filesystem door: a `node:fs` import in a final module is a private resource reader wearing a contract's clothes (§12.4) — the import declaration is the anchor because deleting it is the repair",
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
