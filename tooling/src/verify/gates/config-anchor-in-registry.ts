// Policy: config-anchor-in-registry (config-revamp-design.md §6.8.3) — the hole tsc cannot see. A config
// row's full address is the anchor its owning contribution stamps, so a file that CALLS `configAnchorId(…)`
// while no `ConfigSectionContribution` reaches it is a section painted OUTSIDE the registry: it has an
// anchor the LIST, the scroll spy and the search will never derive a row for. That is the half-migration
// the doctrine bans, and it is invisible to the type system because both halves type fine on their own.
//
// A file is REGISTERED when it declares a contribution itself (the anchor is passed into a body as a prop —
// the persona this-chat shape) or when some contribution's `body` renders a component whose CANONICAL
// declaration lives in it (the `components/x-section.tsx` ↔ `lib/x-section.tsx` pair every other section
// uses). Both halves judge a RESOLVED identity and both FAIL CLOSED on one they cannot read: the anchor
// call must resolve to the canonical `configAnchorId` export or be unreadable (`anchorCallReports`), and a
// rendered tag must resolve to the module that declares the component or it does not register that module
// (`renderedModules`) — a same-named local function in the stamping file proves nothing either way. The
// header said "both halves are resolved identities" for three days while `isAnchorCall` ACQUITTED on
// unreadable; per-arm answers, not a per-module sentence (see `anchorCallReports`).
//
// AUTHORITY IS reviewed-grant, which is why this arm has its own policy id rather than riding
// `config-group-completeness`. Its exceptions are not per-occurrence mistakes: the config feature's own JUMP
// and SPY read anchors to scroll to them, which is a recurring repository PERMISSION. Each is an exact
// `(subject, operation)` row in the central reviewed-grant table with `why` and `endsWhen`; a row consumed
// zero times is STALE and a row matching more than one finding is OVER-BROAD and licenses nothing. Nothing
// here subtracts a path from the population, and this policy holds no allowlist of its own — the legacy
// regex that exempted `state/` and `features/config/` wholesale is deleted.
//
// FAMILY: a declared SINGLETON under its own id. It rides `lib/registry-fact.ts`,
// `lib/registry-definition-field.ts`, `lib/reference-fact-call.ts` and `lib/origin-verdict.ts`, but every
// one of those is a shared PRIMITIVE a dozen policies use; a shared primitive is not a family, and no
// sibling asks whether an anchor stamp is registered.
// POPULATION PORT: BYTE-IDENTICAL, inherited — this policy was SPLIT OUT of `config-group-completeness`
// at conversion and has no legacy descriptor of its own, so the port is that parent's: legacy
// `path.includes("/packages/client/src/")` is exactly `@client`.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 1,319 admitted on both sides, symmetric difference ZERO in both directions.
// LEGACY SHA: (58370d705^) — the parent of the commit that split this policy out.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { resolveCallableOrigin } from "../lib/reference-fact-call.ts";
import { definitionField } from "../lib/registry-definition-field.ts";
import { readJsxTagFact, registryDefinitionFacts } from "../lib/registry-fact.ts";
import { readMemberAccess } from "../lib/symbol-reference.ts";

const ANCHOR_FN = "configAnchorId";
const OPERATION = "config-anchor-stamp";
const STAMPER_POPULATION = "config anchor stamper";

const MESSAGE =
  "a file stamps `configAnchorId(…)` but no ConfigSectionContribution reaches it — a section painted OUTSIDE the " +
  "registry has an anchor the config LIST, the scroll spy and the search can never derive a row for " +
  "(config-revamp-design.md §6.8.3).";
const FIX =
  "register the anchored section as a ConfigSectionContribution whose `body` renders the component that stamps the anchor (or pass the anchor in from the contribution); a file that merely READS anchors needs an exact reviewed grant.";

interface Located {
  readonly node: MorphNode;
  readonly path: string;
}

function contains(outer: MorphNode, inner: MorphNode): boolean {
  return outer.getSourceFile().compilerNode === inner.getSourceFile().compilerNode && outer.getStart() <= inner.getStart() && inner.getEnd() <= outer.getEnd();
}

/** Does this call stamp an anchor? FAIL-CLOSED, and the polarity is the whole point.
 *
 *  This is an ACCUSING arm, so the three outcomes are not symmetric. A call that PROVABLY binds something
 *  else (the local `configAnchorId` decoy in `mustPass[2]`) is a different identity and is acquitted. A call
 *  whose identity cannot be read at all is a stamp the config surfaces cannot derive a row for either, which
 *  is the defect this policy exists to name — so it REPORTS. Until 2026-09-12 the predicate was
 *  `origin.kind === "resolved" && …`, an identity ACQUITTAL sitting in the accusing position: unreadable
 *  passed silently, while the sibling `renderedModules` arm treated an unresolved tag as NOT-registered and
 *  accused. One module, one question, two answers (cb-v-unaudited-finals L3; the guide's FOURTH POLARITY,
 *  which the mechanical `!== "foreign"` sweep cannot find because no such comparison is written).
 *
 *  Fail-closure is safe HERE and only here because the candidate set is already name-prefiltered
 *  (`anchorNames.has(name)` in the CallExpression visitor — the canonical export plus its import aliases).
 *  `lib/origin-verdict.ts` is the home of that requirement: prefilter on the name, resolve the identity, and
 *  fail closed only inside the candidate set. Without the prefilter this would convert every unreadable call
 *  in `@client` into an accusation. */
function anchorCallReports(node: MorphNode): boolean {
  const origin = resolveCallableOrigin(node);
  if (origin.kind === "resolved") {
    return origin.value.target.kind === "module" && origin.value.target.canonical.exportedName === ANCHOR_FN;
  }
  return Node.isCallExpression(node) && classifyOriginRefusal(origin.reason, node.getExpression()) === "unreadable";
}

/** The modules a contribution's `body` renders a component from — its registered painting surfaces. */
function renderedModules(definition: RegistryDefinitionFact, tags: readonly Located[], into: Set<string>): void {
  if (definition.object.kind === "unresolved") {
    return;
  }
  const body = definitionField(definition.object.value, "body");
  if (body === undefined) {
    return;
  }
  for (const tag of tags.filter((candidate) => contains(body, candidate.node))) {
    const fact = readJsxTagFact(tag.node);
    if (fact.kind === "resolved" && fact.value.origin.canonical.kind === "project") {
      into.add(fact.value.origin.canonical.sourceFile.getFilePath());
    }
  }
}

export const gate = defineGate({
  id: "config-anchor-in-registry",
  family: "config-anchor-in-registry",
  authority: "reviewed-grant",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [registryDefinitionFacts["config-section"]],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const anchorNames = new Set<string>([ANCHOR_FN]);
    const callCandidates: Located[] = [];
    const tags: Located[] = [];

    /** The name a call invokes, in EVERY member spelling (#2199). The member half reads through
     *  `lib/symbol-reference.ts` rather than `PropertyAccessExpression.getName()`, because
     *  `opaque()["configAnchorId"](…)` is the same stamp as `opaque().configAnchorId(…)` — and it is the
     *  UNREADABLE-stamp row, the one arm whose whole purpose is to fail CLOSED, that the property-keyed read
     *  silently dropped out of the candidate set before `anchorCallReports` ever got to judge it. */
    const calleeName = (call: MorphNode): string | undefined => {
      if (!Node.isCallExpression(call)) {
        return;
      }
      const expression = call.getExpression();
      return Node.isIdentifier(expression) ? expression.getText() : readMemberAccess(expression)?.name;
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node) => {
            if (Node.isImportSpecifier(node) && node.getName() === ANCHOR_FN) {
              anchorNames.add(node.getAliasNode()?.getText() ?? node.getName());
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile: SourceFile) => {
            const name = calleeName(node);
            if (name !== undefined && anchorNames.has(name)) {
              callCandidates.push({ node, path: ctx.relativePath(sourceFile) });
            }
          },
        },
        {
          kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
          visit: (node, sourceFile: SourceFile) => tags.push({ node, path: ctx.relativePath(sourceFile) }),
        },
      ],
      evaluate: () => {
        const contributions = ctx.fact(registryDefinitionFacts["config-section"]);
        const registered = new Set<string>();
        for (const definition of contributions.definitions) {
          registered.add(definition.declaration.getSourceFile().getFilePath());
          renderedModules(definition, tags, registered);
        }
        const stamps = new Map<string, MorphNode>();
        for (const candidate of callCandidates.filter(({ node }) => anchorCallReports(node))) {
          if (!stamps.has(candidate.path)) {
            stamps.set(candidate.path, candidate.node);
          }
        }
        ctx.receipt({ kind: "population", source: contributions.source, members: contributions.definitions.length, unresolved: 0 });
        ctx.receipt({ kind: "population", source: STAMPER_POPULATION, members: stamps.size, unresolved: 0 });
        for (const [path, node] of [...stamps].toSorted(([left], [right]) => left.localeCompare(right))) {
          if (!registered.has(node.getSourceFile().getFilePath())) {
            ctx.report.node(node, { subject: path, operation: OPERATION, message: `${MESSAGE} Stamper: ${path}.`, fix: FIX });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "packages/client/src/features/b/components/orphan-section.tsx", operation: "config-anchor-stamp" },
      files: {
        "packages/client/src/state/config-section-registry.ts":
          "export interface ConfigSectionContribution { readonly id: string }\nexport function configAnchorId(group: string, sub: string): string {\n  return `${group}-${sub}`;\n}\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { ConfigSectionContribution } from "../../../state/config-section-registry.ts";\nimport { ASection } from "../components/a-section.tsx";\nexport const aSection: ConfigSectionContribution = { id: "a", body: () => <ASection /> };\n',
        "packages/client/src/features/a/components/a-section.tsx":
          'import { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const ASection = (): unknown => configAnchorId("a", "one");\n',
        "packages/client/src/features/b/components/orphan-section.tsx":
          'import { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const OrphanSection = (): unknown => configAnchorId("b", "one");\n',
      },
      expect: { count: 1, messageIncludes: "features/b/components/orphan-section.tsx" },
      why: "the founding hole: a component stamps an anchor and NO contribution renders it, so the list, the spy and the search will never derive its row — while the registered sibling stays silent",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/config-section-registry.ts":
          "export interface ConfigSectionContribution { readonly id: string }\nexport function configAnchorId(group: string, sub: string): string {\n  return `${group}-${sub}`;\n}\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { ConfigSectionContribution } from "../../../state/config-section-registry.ts";\nimport { ASection } from "../components/a-section.tsx";\nexport const aSection: ConfigSectionContribution = { id: "a", body: () => <ASection /> };\n',
        "packages/client/src/features/a/components/a-section.tsx":
          'import { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const ASection = (): unknown => configAnchorId("a", "one");\n',
        "packages/client/src/features/b/components/orphan-section.tsx":
          'import { configAnchorId as anchor } from "../../../state/config-section-registry.ts";\nexport const OrphanSection = (): unknown => anchor("b", "one");\n',
      },
      expect: { count: 1, messageIncludes: "features/b/components/orphan-section.tsx" },
      why: "THE ALIAS RED: the anchor mint imported under another local name is the same stamp. A bare-identifier match leaves the whole class unspelled",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/config-section-registry.ts":
          "export interface ConfigSectionContribution { readonly id: string }\nexport function configAnchorId(group: string, sub: string): string {\n  return `${group}-${sub}`;\n}\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { ConfigSectionContribution } from "../../../state/config-section-registry.ts";\nimport { ASection } from "../components/a-section.tsx";\nexport const aSection: ConfigSectionContribution = { id: "a", body: () => <ASection /> };\n',
        "packages/client/src/features/a/components/a-section.tsx":
          'import { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const ASection = (): unknown => configAnchorId("a", "one");\n',
        "packages/client/src/features/b/components/impostor-section.tsx":
          'import { configAnchorId } from "../../../state/config-section-registry.ts";\nfunction ASection(): null {\n  return null;\n}\nexport const B = (): unknown => [configAnchorId("b", "one"), ASection];\n',
      },
      expect: { count: 1, messageIncludes: "features/b/components/impostor-section.tsx" },
      why: "THE COUNTERFACTUAL: this stamper declares a component with the SAME NAME as the one the registered contribution renders, and is still unregistered — a rendered tag is matched to the module that DECLARES the component, never to a name",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/config-section-registry.ts":
          "export interface ConfigSectionContribution { readonly id: string }\nexport function configAnchorId(group: string, sub: string): string {\n  return `${group}-${sub}`;\n}\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { ConfigSectionContribution } from "../../../state/config-section-registry.ts";\nimport { ASection } from "../components/a-section.tsx";\nexport const aSection: ConfigSectionContribution = { id: "a", body: () => <ASection /> };\n',
        "packages/client/src/features/a/components/a-section.tsx":
          'import { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const ASection = (): unknown => configAnchorId("a", "one");\n',
        "packages/client/src/features/b/components/opaque-section.tsx":
          'declare function opaque(): any;\nexport const OpaqueSection = (): unknown => opaque().configAnchorId("b", "one");\n',
      },
      expect: { count: 1, messageIncludes: "features/b/components/opaque-section.tsx" },
      why: "THE UNREADABLE STAMP, and the row that dies if `anchorCallReports` stops failing CLOSED. The guide's reusable falsifier (an opaque `any` receiver) drives every origin reader into refusal, so the identity of this stamp CANNOT be established. Before 2026-09-12 that acquitted it: `isAnchorCall` reported only on a RESOLVED canonical export, which is an ACCUSING arm whose predicate is an identity ACQUITTAL — the fourth polarity, fail-OPEN, in a module whose `renderedModules` arm fails CLOSED on the very same question (cb-v-unaudited-finals L3). A stamper the reader cannot read is exactly the section the list, the spy and the search cannot derive a row for, so silence was the wrong answer",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/config-section-registry.ts":
          "export interface ConfigSectionContribution { readonly id: string }\nexport function configAnchorId(group: string, sub: string): string {\n  return `${group}-${sub}`;\n}\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { ConfigSectionContribution } from "../../../state/config-section-registry.ts";\nimport { ASection } from "../components/a-section.tsx";\nexport const aSection: ConfigSectionContribution = { id: "a", body: () => <ASection /> };\n',
        "packages/client/src/features/a/components/a-section.tsx":
          'import { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const ASection = (): unknown => configAnchorId("a", "one");\n',
        "packages/client/src/features/b/components/opaque-section.tsx":
          'declare function opaque(): any;\nexport const OpaqueSection = (): unknown => opaque()["configAnchorId"]("b", "one");\n',
      },
      expect: { count: 1, messageIncludes: "features/b/components/opaque-section.tsx" },
      why: 'THE BRACKET SPELLING of the unreadable stamp (#2199) — the same call, written `opaque()["configAnchorId"](…)`. It is a row rather than a note because the candidate PREFILTER, not the identity reader, is what dropped it: `calleeName` read `PropertyAccessExpression.getName()`, so an element-access callee produced no candidate at all and `anchorCallReports` — the fail-CLOSED arm — was never asked. Measured on the unmodified module: 0 findings, a silent clean on the exact stamp the gate exists to name',
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/config-section-registry.ts":
          "export interface ConfigSectionContribution { readonly id: string }\nexport function configAnchorId(group: string, sub: string): string {\n  return `${group}-${sub}`;\n}\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { ConfigSectionContribution } from "../../../state/config-section-registry.ts";\nimport { ASection } from "../components/a-section.tsx";\nexport const aSection: ConfigSectionContribution = { id: "a", body: () => <ASection /> };\n',
        "packages/client/src/features/a/components/a-section.tsx":
          'import { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const ASection = (): unknown => configAnchorId("a", "one");\n',
      },
      why: "the sanctioned pair: `lib/a-section.tsx` registers the contribution and its body renders the `components/a-section.tsx` component that stamps the anchor — every other section on the tree",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/config-section-registry.ts":
          "export interface ConfigSectionContribution { readonly id: string }\nexport function configAnchorId(group: string, sub: string): string {\n  return `${group}-${sub}`;\n}\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { ConfigSectionContribution } from "../../../state/config-section-registry.ts";\nimport { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const aSection: ConfigSectionContribution = { id: "a", body: () => configAnchorId("a", "one") };\n',
      },
      why: "the persona this-chat shape: the stamping file DECLARES the contribution itself and passes the anchor into its own body — registered without a component pair",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/config-section-registry.ts":
          "export interface ConfigSectionContribution { readonly id: string }\nexport function configAnchorId(group: string, sub: string): string {\n  return `${group}-${sub}`;\n}\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { ConfigSectionContribution } from "../../../state/config-section-registry.ts";\nimport { configAnchorId } from "../../../state/config-section-registry.ts";\nexport const aSection: ConfigSectionContribution = { id: "a", body: () => configAnchorId("a", "one") };\n',
        "packages/client/src/features/b/components/decoy.tsx":
          'function configAnchorId(group: string, sub: string): string {\n  return `${group}-${sub}`;\n}\nexport const Decoy = (): unknown => configAnchorId("b", "one");\n',
      },
      why: "THE COUNTERFACTUAL on the mint: a LOCAL function named `configAnchorId` stamps nothing the config surfaces will ever read, so its caller is not a stamper — a bare-identifier match accused it",
    },
  ],
});
