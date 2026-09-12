// Policy: policy-legacy-imports — a FINAL module may not import the legacy descriptor contract or the central
// authority machinery (#2111; family `policy-soundness`, reader `lib/policy-descriptor-read.ts` for the
// registration and `lib/gate-contract-origin.ts`'s import-origin discipline for the identity). §12.5:
// *"gate modules receive neither grant tables nor marker parsers"*; §3's non-negotiables: no gate-owned
// exemption table; §12.8: zero `ExemptionRow` tables, no private runtime. NOTHING held any of it for a final
// module until this policy: `gate-modernization` ARM B judges only whether an exemption table carries a STALE
// arm (the legacy law), and the loader validates the descriptor OBJECT, which cannot see an import. Measured
// 2026-09-12 across the 246 final modules: NINE import `contract/gate.ts` (`ExemptionTable` ×8, `ExemptionRow`
// ×2, `Finding` ×2), every one a legacy exemption artifact carried across its conversion — the #1922 authority
// migration's exact work list, and this policy is the enforcer that keeps it from growing while that migration
// drains. Those nine are RED on the real tree by design (owner ruling 2026-09-12: the red is the finding).
//
// THE ONE ARM, PER MEMBER. An `ImportDeclaration` whose specifier RESOLVES — by `getModuleSpecifierSourceFile()`,
// never by the specifier's spelling — to one of `FORBIDDEN_IMPORT_HOMES`:
//   `contract/gate.ts`        the legacy descriptor law (`ExemptionTable`, `ExemptionRow`, `Finding`,
//                             `GateDescriptor`, `GateRunCtx`, `GateExample`)
//   `lib/pass.ts`             the legacy single-pass dispatcher (`runPass`, `fileLoaded`, `repoRel`)
//   `lib/gate-ignore.ts`      the legacy `@orb-gate-ignore` parser (§7 kind 1)
//   `lib/reviewed-grants.ts`  the central grant table (§12.5: a module receives no grant table)
//   `lib/ordinary-waiver.ts`  the central `@orb-waive` engine (§12.5: a module receives no marker parser)
//   `lib/gate-authority.ts`   the central coordinator
//   `lib/policy-pass.ts`      the final dispatcher (a pass inside a pass is a private workspace cache, §12.3)
//   `lib/loader.ts` · `lib/policy-loader.ts`   the registry (a module that loads the corpus judges itself)
// IDENTITY, NOT SPELLING, with the `lib/origin-verdict.ts` discipline: the candidate set is NAME-prefiltered
// (a specifier whose basename is a forbidden home's), the identity is the RESOLVED path's suffix, and the
// refusal fails closed only inside the candidate set — a candidate that resolves to NOTHING is reported under
// the disjoint UNREADABLE text rather than acquitted on its spelling, and a same-basename module elsewhere
// (`gates/pass.ts` beside the module) is acquitted by its resolved path. A specifier whose basename is not a
// forbidden home's is never resolved at all, which is what keeps `react`, `ts-morph` and every `../lib/`
// reader out of the accusation.
//
// WHAT THIS IS NOT. `../contract/policy.ts`, `../contract/fact.ts` and every other `contract/*` are the FINAL
// contract and its type homes — imported by every policy. `lib/gate-contract.ts` and `lib/gate-contract-origin.ts`
// are the shared readers the family itself consumes. The list is closed on purpose; a directory-class member
// (`ops/**`, measured at zero consumers) is a contract edit with a named consumer, not a widening here.
//
// BLINDNESS: this module sits inside its own population, so when it is delivered and does not read as final the
// import-origin recognizer is dead and the run THROWS rather than reporting ✓ over the corpus forever (the
// family's tripwire, pinned by a `mustRefuse` row and through `runPolicyPass` in the family test).
// `hard`/`error`: an enforcer a gate module could waive out of would be the door §12.5 closed, reopened.
import type { ImportDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { finalRegistrationOf } from "../lib/policy-descriptor-read.ts";
import { familyFixture, finalProbeModule, HARD_TRUNK } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-legacy-imports.ts";

/** The closed set, as REPO-RELATIVE suffixes the resolved path is judged by. Each member has its own row. */
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

const MESSAGE =
  "a FINAL policy module imports the legacy descriptor contract or the central authority machinery (gate-runtime-standardization.md §12.5, §12.8): " +
  "`contract/gate.ts` (ExemptionTable/ExemptionRow/Finding/GateDescriptor), the legacy dispatcher or marker parser, the grant table, the waiver " +
  "engine, the coordinator, the final dispatcher or the loader. A gate module receives neither grant tables nor marker parsers, owns no " +
  "exemption table, and runs no pass of its own; a legacy artifact carried across a conversion is the #1922 migration's work, never a keep. " +
  "The `from` token names the import; the message names the resolved home.";
const UNREADABLE_MESSAGE =
  "a FINAL policy module imports a specifier whose basename is a forbidden home's (`gate.ts`, `pass.ts`, `gate-ignore.ts`, `reviewed-grants.ts`, " +
  "`ordinary-waiver.ts`, `gate-authority.ts`, `policy-pass.ts`, `loader.ts`, `policy-loader.ts`) and the specifier resolves to NOTHING — the import " +
  "origin CANNOT be established, so the module is reported rather than acquitted on the strength of a spelling (#944 fail-closed).";
const FIX =
  "migrate the exemption table to exact reviewed grants (#1922, §12.5), replace a `Finding`-typed helper with `ctx.report.node`/`ctx.report.file`, " +
  "and delete every import of the legacy or central machinery; a final module reads only `contract/*` and the shared `lib/` readers.";
const BLIND =
  `BLINDNESS: ${SELF} is in the effective population and does not read as a final policy — the import-origin recognizer ` +
  "(lib/gate-contract-origin.ts isCanonicalDefineGate) is dead, so every module would read out of scope. Refusing the run.";

function basenameOf(specifier: string): string {
  return specifier.slice(specifier.lastIndexOf("/") + 1);
}

/** The forbidden home a declaration resolves to, `"unreadable"` for a candidate that resolves nowhere, or
 *  undefined for an import that is not a candidate at all or resolves to an unrelated module. */
function forbiddenOrigin(declaration: ImportDeclaration): string | undefined {
  if (!FORBIDDEN_BASENAMES.has(basenameOf(declaration.getModuleSpecifierValue()))) {
    return;
  }
  const target = declaration.getModuleSpecifierSourceFile()?.getFilePath().replaceAll("\\", "/");
  if (target === undefined) {
    return "unreadable";
  }
  return FORBIDDEN_IMPORT_HOMES.find((home) => target.endsWith(home));
}

function judgeModule(ctx: GatePolicyContext, imports: readonly ImportDeclaration[]): void {
  for (const declaration of imports) {
    const origin = forbiddenOrigin(declaration);
    if (origin === undefined) {
      continue;
    }
    const specifier = declaration.getModuleSpecifier();
    const offset = specifier.getStart() - declaration.getStart();
    ctx.report.node(declaration, {
      token: specifier.getText(),
      offset,
      message: origin === "unreadable" ? UNREADABLE_MESSAGE : `${MESSAGE} Resolved home: ${origin.slice(1)}.`,
    });
  }
}

/** A final module importing `named` from `specifier`, beside the planted target so the origin resolves. */
const IMPORTING = (specifier: string, named: string): string =>
  finalProbeModule(
    `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
    `import type { ${named} } from "${specifier}";\n`,
  );
const TARGET = (path: string, named: string): Readonly<Record<string, string>> => ({ [path]: `export type ${named} = unknown;\n` });

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
    const imports = new Map<SourceFile, ImportDeclaration[]>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration],
          visit: (node, sourceFile): void => {
            if (Node.isImportDeclaration(node)) {
              imports.set(sourceFile, [...(imports.get(sourceFile) ?? []), node]);
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const sourceFile of ctx.files) {
          const path = ctx.relativePath(sourceFile);
          if (finalRegistrationOf(sourceFile) !== undefined) {
            judgeModule(ctx, imports.get(sourceFile) ?? []);
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
      why: "THE FOUNDING SHAPE and the live class (nine modules at mint): the legacy `ExemptionTable` carried behind `defineGate` — the position is the specifier, because deleting the import is the repair",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/pass.ts", "PassResult"), TARGET("tooling/src/verify/lib/pass.ts", "PassResult")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/pass.ts" },
      why: "MEMBER `lib/pass.ts` — the legacy dispatcher; a final module that reaches it runs a pass of its own",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/gate-ignore.ts", "GateIgnoreMarker"), TARGET("tooling/src/verify/lib/gate-ignore.ts", "GateIgnoreMarker")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/gate-ignore.ts" },
      why: "MEMBER `lib/gate-ignore.ts` — the legacy `@orb-gate-ignore` parser (§7 kind 1); a final module consuming it re-opens the retired grammar",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/reviewed-grants.ts", "Grants"), TARGET("tooling/src/verify/lib/reviewed-grants.ts", "Grants")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/reviewed-grants.ts" },
      why: "MEMBER `lib/reviewed-grants.ts` — the grant table; §12.5 says a gate module receives none, because a module that reads its own grants decides its own exemptions",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/ordinary-waiver.ts", "Engine"), TARGET("tooling/src/verify/lib/ordinary-waiver.ts", "Engine")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/ordinary-waiver.ts" },
      why: "MEMBER `lib/ordinary-waiver.ts` — the central marker engine; a module that parses markers is a private marker parser by another address",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/gate-authority.ts", "Coordinator"), TARGET("tooling/src/verify/lib/gate-authority.ts", "Coordinator")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/gate-authority.ts" },
      why: "MEMBER `lib/gate-authority.ts` — the central coordinator that owns severity and suppression; a detector never selects its own door",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/policy-pass.ts", "PassInput"), TARGET("tooling/src/verify/lib/policy-pass.ts", "PassInput")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/policy-pass.ts" },
      why: "MEMBER `lib/policy-pass.ts` — the final dispatcher; a pass inside a pass is the private workspace cache §12.3 forbids",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/loader.ts", "Corpus"), TARGET("tooling/src/verify/lib/loader.ts", "Corpus")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/loader.ts" },
      why: "MEMBER `lib/loader.ts` — the registry; a module that loads the corpus it belongs to judges itself",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../lib/policy-loader.ts", "PolicyCorpus"), TARGET("tooling/src/verify/lib/policy-loader.ts", "PolicyCorpus")),
      expect: { count: 1, messageIncludes: "Resolved home: tooling/src/verify/lib/policy-loader.ts" },
      why: "MEMBER `lib/policy-loader.ts` — the final-only registry view, the same door one module over",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("../contract/gate.ts", "ExemptionTable")),
      expect: { count: 1, token: '"../contract/gate.ts"', messageIncludes: "resolves to NOTHING" },
      why: "FAIL-CLOSED (#944): a candidate specifier that resolves nowhere is reported under the disjoint UNREADABLE text — the origin cannot be established, and acquitting it on its spelling would be the failure mode",
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
      why: "TWO declarations are TWO findings, each at its own specifier — the live `depcruise-grant-liveness` and `runner-config-path-liveness` shape (`ExemptionTable` and `Finding` on separate lines)",
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
      why: "a clean final module importing only the final contract — the ordinary shape of the converted corpus",
    },
    {
      mode: "types",
      files: familyFixture(IMPORTING("./pass.ts", "Local"), TARGET("tooling/src/verify/gates/pass.ts", "Local")),
      why: "IDENTITY, NOT SPELLING: a sibling module named `pass.ts` under `gates/` shares the basename and resolves to an unrelated path — the prefilter admits it as a candidate and the resolved suffix acquits it",
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
      why: "the shared readers a final module DOES consume — `lib/policy-descriptor-read.ts`, `lib/gate-contract.ts` — are not candidates: their basenames are outside the closed set, so they are never resolved",
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
  ],
});
