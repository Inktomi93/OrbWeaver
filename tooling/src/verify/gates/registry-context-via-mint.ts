// Policy: registry-context-via-mint (derive-modernization-audit.md §W3, G26 — the registry-context mint
// sealed). The four registries (section/modal/settings-pane/chrome) share one byte-identical
// context+read-hook+provider trio over a `Registry`/`ContributorRegistry` value, and
// `createRegistryContext` IS that trio. A hand-rolled `createContext<XRegistry | null>(null)` anywhere else
// re-grows the trio that drifts (D72 — a machine ships WITH its seal).
//
// AUTHORITY IS ordinary, and the mint home's legacy `scanRoot` EXCLUSION IS DELETED RATHER THAN TRANSLATED.
// Asked correctly, the home is not an exception at all: `createRegistryContext<R>` calls
// `createContext<R | null>` over a TYPE PARAMETER, and a type parameter is not the `Registry` type. The
// legacy module's own header said as much ("the mint's own `R | null` type-param carries no match"), so the
// exclusion was already licensing nothing — a permanent exemption whose reason is "the detector asks the
// wrong question" is a detector defect, and the wave-3 precedent is to convert on identity and DELETE it.
// This policy therefore holds no `SANCTIONED_HOMES` table and adds no `REVIEWED_GRANTS` row; a genuine
// one-off keeps the central ordinary marker, which is what `ordinary` authority is for.
//
// IDENTITY, NOT SPELLING, on BOTH halves. The callee was `getText() === "createContext"` (or any member
// named that), so a namespace/aliased React import walked past it and another library's `createContext` red;
// it is now React's own export, through the shared React-origin matcher. The type argument was a
// `/Registry\b/` REGEX over the written text, so a local `type SectionRegistry = { … }` that has nothing to
// do with the registry vocabulary red, and a registry aliased to a name without "Registry" in it walked
// past; it is now the canonical `Registry`/`ContributorRegistry` declared in `client/src/lib/registry.ts`,
// followed through declared type-alias hops, with the home located in the population and receipted.
//
// FAMILY `react-origin` — the shared reader is `lib/react-origin.ts` (canonical React export identity),
// consumed here as `createReactExportMatcher("createContext")` for the CALLEE half. The type-argument half
// is `lib/project-home-origin.ts`, a different reader for a different question; what this family owns is
// only "is this REACT's export", which is the half the legacy `getText() === "createContext"` got wrong.
// POPULATION PORT: an INTENTIONAL WIDENING BY EXACTLY ONE PATH. The legacy
// `scanRoot: (p) => p.startsWith("packages/client/src/") && p !== "packages/client/src/lib/create-registry-context.tsx"`
// (`47fc0ae01^`) becomes `@client`, which is `packages/client/src/` exactly — so the ONLY delta is the mint
// home, whose exclusion is DELETED rather than translated for the reason stated above: the mint's
// `createContext<R | null>` is over a TYPE PARAMETER, which is not the `Registry` type, so the exclusion
// licensed nothing and the home is now simply scanned like every other file.
import type { Node as MorphNode, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { referenceResolutionServices, resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import type { LocatedProjectHome, ProjectHomeDeclaration } from "../lib/project-home-origin.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";
import { createReactExportMatcher } from "../lib/react-origin.ts";
import { resolveTypeIdentityOrigin } from "../lib/type-member-origin.ts";
import { REACT_LOOKALIKE_HOME, REACT_TYPES_HOME, reactLookalikeProofModule, reactProofModule } from "./_proof/react.ts";

const CREATE_CONTEXT = "createContext";
const REGISTRY_HOME: ProjectHomeDeclaration = {
  path: "packages/client/src/lib/registry.ts",
  names: ["Registry", "ContributorRegistry"],
};
/** A declared type-alias chain is short by construction; the visited set terminates a self-reference and
 *  this cap keeps a pathological chain from costing the walk. */
const MAX_ALIAS_HOPS = 8;

const MESSAGE =
  "a `createContext` typed over a registry lives outside the createRegistryContext mint — a hand-rolled " +
  "registry context+provider trio drifts from the ONE shape. Use `createRegistryContext<R>(name)` from " +
  "`#lib` (packages/client/src/lib/create-registry-context.tsx). (derive-modernization-audit.md §W3 G26; " +
  "D72 — a machine ships WITH its seal.)";
const UNREADABLE =
  "this call is spelled like React's `createContext` but the shared readers cannot place its binding, so whether it is the context constructor CANNOT be established. Reported rather than passed: the spelling alone is not the identity. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const FIX =
  "replace the hand `createContext<XRegistry | null>(null)` and its Provider with a " +
  "`createRegistryContext<XRegistry>(name)` mint call from #lib. A deliberate site is waived with " +
  "`@orb-waive registry-context-via-mint(<position>): <reason>` on the line above, where <position> is the " +
  "derived position — the first identifier, literal or keyword of the reported node.";

/** The type names written in a type argument: the reference itself, or each arm of a written union
 *  (`Registry<…> | null`). Structural child access only — no descendant traversal. */
function writtenTypeNames(typeNode: TypeNode): readonly MorphNode[] {
  if (Node.isUnionTypeNode(typeNode)) {
    return typeNode.getTypeNodes().flatMap((arm) => writtenTypeNames(arm));
  }
  return Node.isTypeReference(typeNode) ? [typeNode.getTypeName()] : [];
}

/** One declared alias hop: `type SectionRegistry = Registry<Id, Def>` steps to the `Registry` reference. */
function aliasStep(name: MorphNode): readonly MorphNode[] {
  const origin = resolveModuleMemberOrigin(name);
  const lexical = Node.isIdentifier(name) ? referenceResolutionServices.declarationOf(name) : undefined;
  const type = resolveTypeIdentityOrigin(name);
  let declarations = type.kind === "resolved" ? type.value.declarations : [];
  if (lexical?.kind === "resolved") {
    declarations = [lexical.value];
  }
  if (origin.kind === "resolved" && origin.value.canonical.kind === "project") {
    declarations = [origin.value.canonical.declaration];
  }
  return declarations.flatMap((declaration) => {
    if (!Node.isTypeAliasDeclaration(declaration)) {
      return [];
    }
    const aliased = declaration.getTypeNode();
    return aliased === undefined ? [] : writtenTypeNames(aliased);
  });
}

/** Does this type argument name the canonical registry vocabulary, directly or through declared aliases?
 *  A refusal on the way is reported by the CALLEE arm, not here: a type the checker cannot name is not
 *  evidence that a registry context was minted. */
function namesRegistry(typeNode: TypeNode, home: LocatedProjectHome): boolean {
  const visited = new Set<object>();
  let frontier = [...writtenTypeNames(typeNode)];
  for (let hop = 0; hop < MAX_ALIAS_HOPS && frontier.length > 0; hop += 1) {
    if (frontier.some((name) => classifyProjectHomeOrigin(name, home) === "home")) {
      return true;
    }
    const next: MorphNode[] = [];
    for (const name of frontier) {
      if (visited.has(name.compilerNode)) {
        continue;
      }
      visited.add(name.compilerNode);
      next.push(...aliasStep(name));
    }
    frontier = next;
  }
  return false;
}

const REGISTRY_PROOF = {
  "packages/client/src/lib/registry.ts":
    "export interface Registry<Id extends string, Def> {\n  readonly get: (id: Id) => Def;\n}\nexport interface ContributorRegistry<Def extends { readonly id: string }> {\n  readonly all: readonly Def[];\n}\n",
};
const REACT_PROOF = { [REACT_TYPES_HOME]: reactProofModule() };

export const gate = defineGate({
  id: "registry-context-via-mint",
  family: "react-origin",
  authority: "ordinary",
  severity: "error",
  // The legacy predicate was every client source file minus the mint home; the mint home is no longer
  // subtracted because, asked by identity, it is not a subject. `entire-population` because the verdict
  // depends on locating the registry vocabulary's home and REFUSES when it is gone.
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const matcher = createReactExportMatcher(CREATE_CONTEXT);
    const candidates: { readonly node: MorphNode; readonly typeNode: TypeNode; readonly unreadable: boolean }[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const [typeNode] = node.getTypeArguments();
            if (typeNode === undefined) {
              return;
            }
            const verdict = matcher.reference(node.getExpression());
            if (verdict !== "other") {
              candidates.push({ node: typeNode, typeNode, unreadable: verdict === "unreadable" });
            }
          },
        },
      ],
      evaluate: (): void => {
        const home = locateProjectHome(ctx.files, ctx.relativePath, REGISTRY_HOME);
        // ZERO members is a REFUSAL: the registry vocabulary this policy is written against was renamed or
        // moved, so "is this context typed over a registry" has no honest answer.
        ctx.receipt({ kind: "population", source: REGISTRY_HOME.path, members: home.members, unresolved: home.unresolved });
        if (home.sourceFile === undefined) {
          return;
        }
        for (const candidate of candidates) {
          if (candidate.unreadable) {
            ctx.report.node(candidate.node, { message: UNREADABLE, fix: FIX });
            continue;
          }
          if (namesRegistry(candidate.typeNode, home)) {
            ctx.report.node(candidate.node);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/state/g-registry-context.ts":
          'import { createContext } from "react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = createContext<Registry<string, number> | null>(null);\n',
      },
      expect: { count: 1 },
      why: "the founding shape — a hand createContext typed over the raw `Registry<…>`, the direct re-rot of the sealed trio",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/state/namespace-registry-context.ts":
          'import { createContext } from "react";\nimport type * as registry from "../lib/registry.ts";\nexport const C = createContext<registry.Registry<string, number> | null>(null);\n',
      },
      expect: { count: 1 },
      why: "THE NAMESPACE-QUALIFIED TYPE spelling: `registry.Registry` resolves through the shared module-origin reader to the same canonical registry vocabulary",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/state/g2-registry-context.ts":
          'import { createContext } from "react";\nimport type { Registry } from "../lib/registry.ts";\ntype SectionRegistry = Registry<string, number>;\nexport const C = createContext<SectionRegistry | null>(null);\n',
      },
      expect: { count: 1 },
      why: "THE ALIAS FORM: a local `type SectionRegistry = Registry<…>` is the same vocabulary one hop away — followed through the declared alias, where the legacy regex was matching the WORD 'Registry' instead",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/state/g3-registry-context.ts":
          'import * as React from "react";\nimport type { ContributorRegistry } from "../lib/registry.ts";\nexport const C = React.createContext<ContributorRegistry<{ readonly id: string }> | null>(null);\n',
      },
      expect: { count: 1 },
      why: "THE NAMESPACE CALLEE plus the second half of the vocabulary — the legacy callee check accepted any member named `createContext` from anywhere, and this one accepts only React's",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/state/g4-registry-context.ts":
          'import { createContext as mintContext } from "react";\nimport type { Registry as Reg } from "../lib/registry.ts";\nexport const C = mintContext<Reg<string, number> | null>(null);\n',
      },
      expect: { count: 1 },
      why: "BOTH HALVES ALIASED: the constructor and the registry type are each imported under another name, and neither spelling survives — only the two resolved identities do",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/state/opaque-registry-context.ts":
          'import type { Registry } from "../lib/registry.ts";\ndeclare function opaque(): any;\nexport const C = opaque().createContext<Registry<string, number> | null>(null);\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), reached by no row before #2014, and it is the ONE arm of this policy that does not ask the type question at all: a callee spelled `createContext` off an OPAQUE receiver binds nothing, the React matcher answers case (b), and `evaluate` reports the type argument with the UNREADABLE message BEFORE `namesRegistry` runs. The `messageIncludes` is what distinguishes it — the report anchors on the same node and emits the same single finding as the ordinary verdict, so a bare `{ count: 1 }` cannot tell which branch ran",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/lib/create-registry-context.tsx":
          'import { createContext } from "react";\nexport function createRegistryContext<R>(name: string): unknown {\n  const Ctx = createContext<R | null>(null);\n  return { Ctx, name };\n}\n',
      },
      why: "THE HOME, PASSING BY IDENTITY RATHER THAN BY EXCLUSION: the mint types its context over a TYPE PARAMETER, which is not the registry vocabulary. This is why the legacy `scanRoot` exclusion is deleted instead of translated into a grant — there is no permission here to license",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/features/chat/hooks/x-context.tsx":
          'import { createContext } from "react";\nexport const C = createContext<string | null>(null);\n',
      },
      why: "a non-registry context (a plain value type) is untouched — only the registry vocabulary bites",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/state/local-registry-context.ts":
          'import { createContext } from "react";\ninterface SectionRegistry {\n  readonly get: (id: string) => number;\n}\nexport const C = createContext<SectionRegistry | null>(null);\n',
      },
      why: "THE COUNTERFACTUAL on the type: a LOCAL interface whose name merely contains 'Registry' is not the canonical vocabulary — the legacy `/Registry\\b/` regex red exactly this, and a name is not a type identity",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        [REACT_LOOKALIKE_HOME]: reactLookalikeProofModule(),
        "packages/client/src/state/other-context.ts":
          'import { createContext } from "not-react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = createContext<Registry<string, number> | null>(null);\n',
      },
      why: `THE COUNTERFACTUAL on the constructor: another package's \`createContext\` declared in ${REACT_LOOKALIKE_HOME} is not React's context, and only the resolved origin separates the two`,
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/state/mint-call.ts":
          'declare function createRegistryContext<R>(name: string): unknown;\nexport const c = createRegistryContext<{ readonly get: (id: string) => number }>("x");\n',
      },
      why: "a `createRegistryContext` MINT call is the fix and is never a subject — the policy keys on React's constructor, not on any generic call",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        ...REGISTRY_PROOF,
        "packages/client/src/state/g-registry-context.ts":
          'import { createContext } from "react";\nimport type { Registry } from "../lib/registry.ts";\n' +
          "// @orb-waive registry-context-via-mint(Registry): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export const C = createContext<Registry<string, number> | null>(null);\n",
      },
      why: "POSITIONAL IDENTITY: the report anchors on the TYPE ARGUMENT and supplies no explicit token, so the derived position is that node's first authored identity token — `Registry`, the vocabulary the verdict is about, not the `createContext` callee. The fixture is mustFlag[0] (:158) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
  ],
});
