// Policy: policy-binding-resolution — a FINAL module resolves no binding or origin of its own (#2111, #2097;
// family `policy-soundness`, reader `lib/gate-contract-origin.ts` for the member identity and
// `lib/policy-descriptor-read.ts` for the registration). §12.3, owner ruling 2026-09-12: *"gate-local
// binding/origin resolution is FORBIDDEN — `getDefinitionNodes()` and hand-rolled `getSymbol().getDeclarations()`
// chains inside a gate module are the private-reader shape one member at a time; the sanctioned route is the
// shared readers (`_shared/reference-fact.ts` `resolveStableExpression` / `resolveModuleMemberOrigin` /
// `resolveGlobalMemberOrigin`, `_shared/reference-fact-*.ts`, `lib/origin-verdict.ts`)."* Binding identity is a shared
// primitive: one home resolves aliases, re-exports, namespaces and destructuring the same way for every policy,
// refuses on a written or cyclic binding, and fails closed; a gate that walks `getSymbol()?.getDeclarations()[0]`
// re-derives a weaker answer (`no-manual-token-estimate.ts:9` records the `[0]` that read the wrong overload,
// `bus-payload-allowlist.ts:392` the `find()` that walked one of two merged declarations). About 25 sites in 21
// modules carry the shape at this arm's landing — RED on the real tree by design; lane `p-binding-readers` migrates
// them by module. This is its own module rather than an arm of `policy-soundness` for the reason
// `policy-legacy-imports` is: an OPEN class must not sit inside the policy whose closed classes the family pins
// at zero.
//
// THE ONE ARM, PER MEMBER, BY IDENTITY. A call whose callee resolves (through const aliases, destructuring and
// `call`/`apply`/`bind`, `resolveCallableMember`) to a member of the closed tuple `BINDING_RESOLUTION_MEMBERS`, on
// a receiver whose TYPE proves the member is ts-morph's (`isTsMorphMember`, the same receiver-type identity E2 uses
// for the direct-walk codes):
//   node-side  `getDefinitionNodes` · `getDefinitions` · `findReferences` · `findReferencesAsNodes` ·
//              `getImplementations` — declared only on ts-morph nodes, so ts-morph provenance identifies them;
//   symbol-side `getDeclarations` · `getValueDeclaration` · `getValueDeclarationOrThrow` · `getAliasedSymbol` ·
//              `getAliasedSymbolOrThrow` — declared on ts-morph's `Symbol`, and judged with the OWNER: a
//              same-named SYNTAX accessor (`VariableStatement#getDeclarations`, `VariableDeclarationList#…`) reads
//              a statement's own children and is acquitted by owner identity, never by spelling.
// `getSymbol()` ALONE is not a member: comparing two symbols for identity resolves nothing, and the retired
// `getSymbol().getDeclarations()` chain is caught at its second hop. The tuple is closed on purpose (`getExports`,
// `getMembers`, `getExportSymbol` are not named by the ruling); a widening is a contract edit with a receipt.
// DECLARED LIMIT, with its run row: a receiver the checker types as `any` proves no owner and is acquitted — the
// same limit E2's walk identity carries; an opaque receiver hides the member from every type-keyed arm.
//
// BLINDNESS: this module sits inside its own population, so when it is delivered and does not read as final the
// import-origin recognizer is dead and the run THROWS rather than reporting ✓ over the corpus forever (the
// family's tripwire, pinned by a `mustRefuse` row and through `runPolicyPass` in the family test). `hard`/`error`.
//
// FAMILY `policy-soundness` — the shared reader is `lib/policy-descriptor-read.ts` (`finalRegistrationOf`
// for the contract kind, `stableTerminal` / `objectLiteralOf` for the binding walk this module's whole
// question is about). The family is a shared `lib/` computation, not a topic: the OPEN resolution class
// lives here so `policy-soundness`'s closed-class pin can stay honest at zero.
// POPULATION PORT: NONE — no legacy population exists to port, because this module was BORN FINAL. It first
// appears at `d334dd5ca` already carrying `defineGate`, and `git show d334dd5ca^:<this file>` refuses with
// "exists on disk, but not in d334dd5ca^". That refusal IS the receipt (the `scrubber-factory-home`
// precedent) and is strictly better than an invented pre-conversion sha. Note for a later census: this
// module did not exist at `61cae0710`, the tip the #2005 census was taken at, so it is one of the two that
// made that census's "248 modules" read stable while its membership moved.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { isTsMorphMember, resolveCallableMember } from "../lib/gate-contract-origin.ts";
import { finalRegistrationOf } from "../lib/policy-descriptor-read.ts";
import { familyFixture, finalProbeModule, HARD_TRUNK, TS_MORPH_TYPES_PATH, TS_MORPH_TYPES_STUB } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-binding-resolution.ts";
const SYMBOL_OWNER = "Symbol";

/** The closed tuple, member → the ts-morph OWNER the identity must prove (`undefined`: any ts-morph declaration). */
const BINDING_RESOLUTION_MEMBER_TABLE = {
  getDefinitionNodes: undefined,
  getDefinitions: undefined,
  findReferences: undefined,
  findReferencesAsNodes: undefined,
  getImplementations: undefined,
  getDeclarations: SYMBOL_OWNER,
  getValueDeclaration: SYMBOL_OWNER,
  getValueDeclarationOrThrow: SYMBOL_OWNER,
  getAliasedSymbol: SYMBOL_OWNER,
  getAliasedSymbolOrThrow: SYMBOL_OWNER,
} as const satisfies Record<string, string | undefined>;
type BindingResolutionMember = keyof typeof BINDING_RESOLUTION_MEMBER_TABLE;

function isBindingResolutionMember(name: string): name is BindingResolutionMember {
  return Object.hasOwn(BINDING_RESOLUTION_MEMBER_TABLE, name);
}

const MESSAGE =
  "a FINAL policy module resolves a binding or an origin LOCALLY (gate-runtime-standardization.md §3, owner ruling #2097): `getDefinitionNodes()`, " +
  "`findReferences()`, `Symbol#getDeclarations()`, `getAliasedSymbol()` and their twins inside a gate module are the private-reader shape one member at a " +
  "time — a weaker re-derivation of what the shared readers answer once for every policy, with alias, re-export, namespace and destructuring " +
  "resolution, write and cycle refusals, and a fail-closed verdict. Read through `_shared/reference-fact.ts` (`resolveStableExpression`, " +
  "`resolveModuleMemberOrigin`, `resolveGlobalMemberOrigin`) or `lib/origin-verdict.ts`, or add the missing question to a shared reader.";
const FIX =
  'replace the local chain with the shared reader that answers the question — `resolveModuleMemberOrigin(node)` for "which module export is this", ' +
  '`resolveGlobalMemberOrigin(node)` for an ambient global, `resolveStableExpression(node)` for "what does this binding hold", ' +
  "`bindsProvenNonModuleDeclaration(node)` / `classifyOriginRefusal` (lib/origin-verdict.ts) for the pass/report split; a question none of " +
  "them asks is a reader to ADD under `lib/`, never a walk to keep (#2097, lane p-binding-readers).";
const BLIND =
  `BLINDNESS: ${SELF} is in the effective population and does not read as a final policy — the import-origin recognizer ` +
  "(lib/gate-contract-origin.ts isCanonicalDefineGate) is dead, so every module would read out of scope. Refusing the run.";

interface ResolutionSite {
  readonly nameNode: MorphNode;
  readonly member: BindingResolutionMember;
}

/** The binding-resolution member a call invokes, proven by receiver identity, or undefined. */
function resolutionSiteOf(callee: MorphNode): ResolutionSite | undefined {
  const member = resolveCallableMember(callee);
  if (member === undefined || !isBindingResolutionMember(member.name)) {
    return;
  }
  return isTsMorphMember(member, BINDING_RESOLUTION_MEMBER_TABLE[member.name]) ? { nameNode: member.nameNode, member: member.name } : undefined;
}

function judgeModule(ctx: GatePolicyContext, sites: readonly ResolutionSite[]): void {
  for (const { nameNode, member } of sites) {
    const owner = BINDING_RESOLUTION_MEMBER_TABLE[member];
    ctx.report.node(nameNode, { message: `${MESSAGE} Member: \`${member}\`${owner === undefined ? "" : ` on \`${owner}\``}.` });
  }
}

/** A final module whose body carries `probeBody` beside a `ts-morph` type import, on the ambient stub. */
const RESOLVING = (probeBody: string, imports = "Node"): Readonly<Record<string, string>> =>
  familyFixture(
    finalProbeModule(
      `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
      `import type { ${imports} } from "ts-morph";\n${probeBody}\n`,
    ),
    { [TS_MORPH_TYPES_PATH]: TS_MORPH_TYPES_STUB },
  );
const NODE_MEMBER = (member: string): Readonly<Record<string, string>> => RESOLVING(`export const probe = (node: Node): unknown => node.${member}();`);
const SYMBOL_MEMBER = (member: string): Readonly<Record<string, string>> =>
  RESOLVING(`export const probe = (node: Node): unknown => node.getSymbol()?.${member}();`);

export const gate = defineGate({
  id: "policy-binding-resolution",
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
    const sites = new Map<SourceFile, ResolutionSite[]>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const site = resolutionSiteOf(node.getExpression());
            if (site !== undefined) {
              sites.set(sourceFile, [...(sites.get(sourceFile) ?? []), site]);
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const sourceFile of ctx.files) {
          const path = ctx.relativePath(sourceFile);
          if (finalRegistrationOf(sourceFile) !== undefined) {
            judgeModule(ctx, sites.get(sourceFile) ?? []);
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
      files: NODE_MEMBER("getDefinitionNodes"),
      expect: { count: 1, token: "getDefinitionNodes", messageIncludes: "Member: `getDefinitionNodes`." },
      why: "THE FOUNDING SHAPE the ruling names (#2097): `identifier.getDefinitionNodes()` — the language-service definition walk a gate performs itself. The position is the member name, because replacing the call is the repair. DO NOT re-point this row at live modules: the founding sites (`dangling-refs`, `list-row-adoption`, `json-column-write-parity`) have all since migrated to the shared readers and carry zero live calls, which is this policy succeeding, not the row going stale. A citation of a live example is self-staling here by construction, because the population drains to zero",
    },
    {
      mode: "types",
      files: NODE_MEMBER("getDefinitions"),
      expect: { count: 1, token: "getDefinitions", messageIncludes: "Member: `getDefinitions`." },
      why: "MEMBER `getDefinitions` — the same walk returning definition infos instead of nodes",
    },
    {
      mode: "types",
      files: NODE_MEMBER("findReferences"),
      expect: { count: 1, token: "findReferences", messageIncludes: "Member: `findReferences`." },
      why: "MEMBER `findReferences` — the references half of binding resolution, a whole-program language-service walk from inside one gate",
    },
    {
      mode: "types",
      files: NODE_MEMBER("findReferencesAsNodes"),
      expect: { count: 1, token: "findReferencesAsNodes", messageIncludes: "Member: `findReferencesAsNodes`." },
      why: "MEMBER `findReferencesAsNodes` — the same references walk returning nodes",
    },
    {
      mode: "types",
      files: NODE_MEMBER("getImplementations"),
      expect: { count: 1, token: "getImplementations", messageIncludes: "Member: `getImplementations`." },
      why: "MEMBER `getImplementations` — implementation resolution is origin resolution",
    },
    {
      mode: "types",
      files: SYMBOL_MEMBER("getDeclarations"),
      expect: { count: 1, token: "getDeclarations", messageIncludes: "Member: `getDeclarations` on `Symbol`." },
      why: "THE HAND-ROLLED CHAIN the ruling names: `getSymbol()?.getDeclarations()` — caught at its second hop, on `Symbol` by OWNER identity, and the founding live shape (`plugin-dump-guard.ts:89`, `no-context-returntype.ts:41`, `warning-code-coverage.ts:98`, `platform-spellings.ts:248`)",
    },
    {
      mode: "types",
      files: SYMBOL_MEMBER("getValueDeclaration"),
      expect: { count: 1, token: "getValueDeclaration", messageIncludes: "Member: `getValueDeclaration` on `Symbol`." },
      why: "MEMBER `Symbol#getValueDeclaration` — one declaration instead of the list, the same resolution (`evaluate-no-scope-capture.ts:249`)",
    },
    {
      mode: "types",
      files: SYMBOL_MEMBER("getValueDeclarationOrThrow"),
      expect: { count: 1, token: "getValueDeclarationOrThrow", messageIncludes: "Member: `getValueDeclarationOrThrow` on `Symbol`." },
      why: "MEMBER `Symbol#getValueDeclarationOrThrow` — the throwing twin",
    },
    {
      mode: "types",
      files: SYMBOL_MEMBER("getAliasedSymbol"),
      expect: { count: 1, token: "getAliasedSymbol", messageIncludes: "Member: `getAliasedSymbol` on `Symbol`." },
      why: "MEMBER `Symbol#getAliasedSymbol` — the import-alias hop every hand-rolled origin resolver takes (`(symbol.getAliasedSymbol() ?? symbol).getDeclarations()`, nine live modules); the shared readers take it once, with re-export and namespace resolution the gate copies never had",
    },
    {
      mode: "types",
      files: SYMBOL_MEMBER("getAliasedSymbolOrThrow"),
      expect: { count: 1, token: "getAliasedSymbolOrThrow", messageIncludes: "Member: `getAliasedSymbolOrThrow` on `Symbol`." },
      why: "MEMBER `Symbol#getAliasedSymbolOrThrow` — the throwing twin",
    },
    {
      mode: "types",
      files: RESOLVING("export const probe = (node: Node): unknown => {\n  const walk = node.getDefinitionNodes;\n  return walk.call(node);\n};"),
      expect: { count: 1, token: "getDefinitionNodes", messageIncludes: "Member: `getDefinitionNodes`." },
      why: "THROUGH AN ALIAS AND `call`: the callable member is resolved the way E2 resolves a walk — a const alias invoked through `call`/`apply`/`bind` is the same member, and a spelling-keyed arm reading only `x.getDefinitionNodes(` would acquit it",
    },
    {
      mode: "types",
      files: RESOLVING("export const probe = (node: Node): unknown => [node.getDefinitionNodes(), node.getSymbol()?.getAliasedSymbol()];"),
      expect: { count: 2 },
      why: "TWO sites are TWO findings, one per member, because the migration is per site: replacing one member leaves the other accused. Stated as a property and not a live census on purpose — the counts this row once cited (`chat-viewer-plane-canon-reads` four, `bus-payload-allowlist` three) are both zero now that those modules converted, and any replacement count decays the same way",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: { [SELF]: 'export const gate = { id: "policy-binding-resolution", message: "m" };\n' },
      expect: { messageIncludes: "BLINDNESS" },
      why: "THE BLINDNESS TRIPWIRE, FIRED: this module's own path carrying a descriptor the recognizer does not admit must REFUSE, never report a clean corpus",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: RESOLVING(
        "export const probe = (file: SourceFile): unknown => file.getVariableStatements().flatMap((statement) => statement.getDeclarations());",
        "SourceFile",
      ),
      why: "IDENTITY, NOT SPELLING — the near-miss the OWNER half exists for: `VariableStatement#getDeclarations` is a SYNTAX accessor (a statement's own declarators, `state-files.ts:133`, `test-presence.ts:224`, `no-vanity-alias.ts:102`), the same name on a different ts-morph owner, and resolves nothing. A name-keyed arm would accuse five correct modules",
    },
    {
      mode: "types",
      files: RESOLVING(
        "class Registry {\n  getDeclarations(): string[] {\n    return [];\n  }\n  getDefinitionNodes(): string[] {\n    return [];\n  }\n}\nexport const probe = (): unknown => [new Registry().getDeclarations(), new Registry().getDefinitionNodes()];",
      ),
      why: "IDENTITY of the RECEIVER: a local class carrying both names is somebody's data — its members are not ts-morph's, and the arm proves provenance, never spelling",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
          'import type { Node } from "ts-morph";\nimport { resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";\nexport const probe = (node: Node): unknown => resolveModuleMemberOrigin(node);\n',
        ),
        {
          [TS_MORPH_TYPES_PATH]: TS_MORPH_TYPES_STUB,
          "tooling/src/_shared/reference-fact.ts": "export function resolveModuleMemberOrigin(node: unknown): unknown {\n  return node;\n}\n",
        },
      ),
      why: "THE SANCTIONED ROUTE: the shared reader asked the question. The reader itself walks symbols — under `_shared/`, outside this population, once for everyone — and the gate reads a fact",
    },
    {
      mode: "types",
      files: RESOLVING("export const probe = (node: Node): unknown => node.getSymbol();"),
      why: "`getSymbol()` ALONE is not a member of the tuple: a symbol read for IDENTITY (`a.getSymbol() === b.getSymbol()`) resolves nothing; the retired chain is caught at its second hop, which is where the resolution happens",
    },
    {
      mode: "types",
      files: RESOLVING("declare function opaque(): any;\nexport const probe = (): unknown => opaque().getDefinitionNodes();"),
      why: "DECLARED LIMIT, RUN: a receiver the checker types as `any` proves no owner and no provenance, so the member is acquitted — the same limit E2's walk identity carries, stated with the row that shows it rather than a paragraph. An `any` receiver inside a gate module is `no-any`'s finding, not a hole this arm can close",
    },
    {
      mode: "types",
      files: {
        [TS_MORPH_TYPES_PATH]: TS_MORPH_TYPES_STUB,
        "tooling/src/verify/gates/legacy.ts":
          'import type { Node } from "ts-morph";\nexport const probe = (node: Node): unknown => node.getDefinitionNodes();\nexport const gate = { name: "legacy", docRow: "x", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      why: "SCOPE: a LEGACY descriptor's module is judged by the legacy meta-gate, not here — this policy reads final modules only; its migration is its conversion",
    },
  ],
});
