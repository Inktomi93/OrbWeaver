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
import type { ImportDeclaration, Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { inspectGateContract } from "../lib/gate-contract.ts";
import { descriptorProperty, descriptorValue, finalDescriptorOf, objectLiteralOf, rootOf, stableTerminal, staticText } from "../lib/policy-descriptor-read.ts";
import { familyFixture, finalProbeModule, HARD_TRUNK, TS_MORPH_TYPES_PATH, TS_MORPH_TYPES_STUB } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-soundness.ts";
const FS_MODULE_RE = /^(?:node:)?fs(?:\/promises)?$/u;
const LOADABLE_EXTENSIONS: ReadonlySet<string> = new Set(["ts", "tsx"]);

const MESSAGE =
  "a final policy module carries something the final contract forbids (gate-runtime-standardization.md §3, §12.3): " +
  'an inert `ext: ["ts","tsx"]`, a ts-morph walk / gate-owned Project / module state / baseline ledger / legacy ' +
  "field, or a `node:fs` import. The `ext` token names E1; a `[code]` suffix names the `lib/gate-contract.ts` code; " +
  "an `import` token names the filesystem door.";
const EXT_MESSAGE =
  '`ext: ["ts","tsx"]` is INERT — every policy source is already pre-filtered to .ts/.tsx (lib/policy-source-candidate.ts), ' +
  'so the full set declares nothing and teaches the next lane a no-op (#1959). Delete it; a narrowing (`ext: ["tsx"]`) is live and stays.';
const FS_MESSAGE =
  "a final policy imports the filesystem — §12.3 bans every filesystem read in a gate module; declare the read through the closed " +
  "ResourceHost vocabulary (contract/resource-declaration.ts) or STOP the conversion (a read no kind serves is a refusal, not a private door).";
const FIX =
  "E1: delete the `ext` field. E2: replace the walk with kind-indexed visitors / `ctx.files` / a shared `lib/` reader, move state into " +
  "`create`, retire the ledger into exact grants or warning debt, delete the legacy field. E3: delete the `node:fs` import and declare a resource.";
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

interface JudgedModule {
  readonly sourceFile: SourceFile;
  readonly path: string;
  readonly descriptor: ObjectLiteralExpression;
  readonly fsImports: readonly ImportDeclaration[];
}

/** The three arms over ONE final module. */
function judgeModule(ctx: GatePolicyContext, { sourceFile, path, descriptor, fsImports }: JudgedModule): void {
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
      ],
      evaluate: (): void => {
        for (const sourceFile of ctx.files) {
          const path = ctx.relativePath(sourceFile);
          const descriptor = finalDescriptorOf(sourceFile);
          if (descriptor !== undefined) {
            judgeModule(ctx, { sourceFile, path, descriptor, fsImports: fsImports.get(sourceFile) ?? [] });
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
