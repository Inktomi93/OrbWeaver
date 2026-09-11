// Policy: config-anchor-in-registry (config-revamp-design.md §6.8.3) — the hole tsc cannot see. A config
// row's full address is the anchor its owning contribution stamps, so a file that CALLS `configAnchorId(…)`
// while no `ConfigSectionContribution` reaches it is a section painted OUTSIDE the registry: it has an
// anchor the LIST, the scroll spy and the search will never derive a row for. That is the half-migration
// the doctrine bans, and it is invisible to the type system because both halves type fine on their own.
//
// A file is REGISTERED when it declares a contribution itself (the anchor is passed into a body as a prop —
// the persona this-chat shape) or when some contribution's `body` renders a component whose CANONICAL
// declaration lives in it (the `components/x-section.tsx` ↔ `lib/x-section.tsx` pair every other section
// uses). Both halves are resolved identities: the anchor call resolves to the canonical `configAnchorId`
// export, and a rendered tag resolves to the module that declares the component — a same-named local
// function in the stamping file proves nothing.
//
// AUTHORITY IS reviewed-grant, which is why this arm has its own policy id rather than riding
// `config-group-completeness`. Its exceptions are not per-occurrence mistakes: the config feature's own JUMP
// and SPY read anchors to scroll to them, which is a recurring repository PERMISSION. Each is an exact
// `(subject, operation)` row in the central reviewed-grant table with `why` and `endsWhen`; a row consumed
// zero times is STALE and a row matching more than one finding is OVER-BROAD and licenses nothing. Nothing
// here subtracts a path from the population, and this policy holds no allowlist of its own — the legacy
// regex that exempted `state/` and `features/config/` wholesale is deleted.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { resolveCallableOrigin } from "../lib/reference-fact-call.ts";
import { definitionField } from "../lib/registry-definition-field.ts";
import { readJsxTagFact, registryDefinitionFacts } from "../lib/registry-fact.ts";

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

/** Is this call the canonical anchor mint, proven through the shared callable-origin reader? */
function isAnchorCall(node: MorphNode): boolean {
  const origin = resolveCallableOrigin(node);
  return origin.kind === "resolved" && origin.value.target.kind === "module" && origin.value.target.canonical.exportedName === ANCHOR_FN;
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

    const calleeName = (call: MorphNode): string | undefined => {
      if (!Node.isCallExpression(call)) {
        return;
      }
      const expression = call.getExpression();
      if (Node.isIdentifier(expression)) {
        return expression.getText();
      }
      return Node.isPropertyAccessExpression(expression) ? expression.getName() : undefined;
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
        for (const candidate of callCandidates.filter(({ node }) => isAnchorCall(node))) {
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
