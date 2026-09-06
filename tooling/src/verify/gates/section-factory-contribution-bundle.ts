// Policy: section-factory-contribution-bundle (client-architecture-lockdown.md §12 row 5) — the WALL under
// the §12 row-5 tripwire, which shipped as prose ("≥2 foreign panes ⇒ mint a contribution seam instead")
// with an Enforced-by column no gate could honor: `client-features-no-cross` forces the door, it cannot
// COUNT what arrives through it. Two arms over a `SectionDefinition`-returning factory:
//   BUNDLE — more than one `ContributorRegistry` parameter: every new seam churns the positional signature
//     and all three call sites (the door plus the two CT overrides); collapse them into ONE named-field param;
//   ARITY — more than one CALLABLE parameter: row 5's own rule, where one foreign pane projected into a host
//     is Arm A and two is a contribution seam wearing a prop.
//
// Both identities are now TYPE STRUCTURE, not rendered text and not an alias walk with a hop cap. The
// factory population is the shared `registryDefinitionFact`'s section view, so the return annotation must
// resolve to the canonical exported `SectionDefinition`. A parameter is a registry when its type's own
// declaration IS the canonical exported `ContributorRegistry`, which follows an alias chain of any depth
// for free (`type ChatSeams = ContributorRegistry<X>` is the same positional seam wearing a name — the
// legacy text reader recorded that escape as a blessed declared limit). A parameter is callable when its
// type HAS call signatures, so an aliased function type is a render prop too.
//
// The two blindness tripwires are the runtime's own refusal rather than findings this policy must remember
// to raise: if the canonical `SectionDefinition` or `ContributorRegistry` stops resolving, or the tree holds
// no factory at all, a receipt goes to zero members and the verdict is withheld.
import type { ParameterDeclaration, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { definitionAnchor, definitionName } from "../lib/registry-definition-anchor.ts";
import { registryDefinitionFact } from "../lib/registry-fact.ts";

const REGISTRY = "ContributorRegistry";
const FACTORY_POPULATION = "SectionDefinition factory";

const MESSAGE =
  "a section factory grew a positional contributor signature: more than one `ContributorRegistry` parameter (collapse " +
  "them into ONE named-field bundle) or more than one callable render-prop parameter (two foreign panes means minting a " +
  "contribution seam). See client-architecture-lockdown.md §12 row 5.";
const FIX =
  "bundle the registries into one named-field parameter (`make<X>Section({ contextTabs, surfaces, … })`); for a second foreign pane, mint a contributor registry and assemble it at the main.tsx door.";

/** A factory's declared parameters, across both authoring shapes (a function declaration, or a const
 *  holding an arrow/function expression). */
function factoryParameters(definition: RegistryDefinitionFact): readonly ParameterDeclaration[] {
  const declaration = definition.declaration;
  if (Node.isFunctionDeclaration(declaration)) {
    return declaration.getParameters();
  }
  if (!Node.isVariableDeclaration(declaration)) {
    return [];
  }
  const initializer = declaration.getInitializer();
  return initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) ? initializer.getParameters() : [];
}

/** The parameter's ANNOTATED type. An unannotated parameter has no authored type to judge. */
function annotatedType(parameter: ParameterDeclaration): Type | undefined {
  return parameter.getTypeNode()?.getType();
}

function declaresCanonicalRegistry(type: Type | undefined, canonical: ReadonlySet<object>): boolean {
  return (type?.getSymbol()?.getDeclarations() ?? []).some((declaration) => canonical.has(declaration.compilerNode));
}

export const gate = defineGate({
  id: "section-factory-contribution-bundle",
  family: "registry-definitions",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [registryDefinitionFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const registryDeclarations = new Set<object>();

    const judge = (definition: RegistryDefinitionFact): void => {
      const name = definitionName(definition.declaration);
      const anchor = definitionAnchor(definition.declaration);
      const parameters = factoryParameters(definition);
      const registries: string[] = [];
      const callables: string[] = [];
      for (const parameter of parameters) {
        const type = annotatedType(parameter);
        if (declaresCanonicalRegistry(type, registryDeclarations)) {
          registries.push(parameter.getName());
        } else if ((type?.getCallSignatures().length ?? 0) > 0) {
          callables.push(parameter.getName());
        }
      }
      if (registries.length > 1) {
        ctx.report.node(definition.declaration, {
          ...anchor,
          message: `${MESSAGE} \`${name}\` takes ${registries.length} ${REGISTRY} parameters (${registries.join(", ")}).`,
          fix: FIX,
        });
      }
      if (callables.length > 1) {
        ctx.report.node(definition.declaration, {
          ...anchor,
          message: `${MESSAGE} \`${name}\` takes ${callables.length} callable render-prop parameters (${callables.join(", ")}).`,
          fix: FIX,
        });
      }
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.InterfaceDeclaration, SyntaxKind.TypeAliasDeclaration],
          visit: (node) => {
            if ((Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)) && node.isExported() && node.getName() === REGISTRY) {
              registryDeclarations.add(node.compilerNode);
            }
          },
        },
      ],
      evaluate: () => {
        const sections = ctx.fact(registryDefinitionFact).forKind("section");
        const factories = sections.definitions.filter(({ shape }) => shape === "factory");
        ctx.receipt({ kind: "population", source: FACTORY_POPULATION, members: factories.length, unresolved: 0 });
        ctx.receipt({ kind: "population", source: REGISTRY, members: registryDeclarations.size, unresolved: registryDeclarations.size === 1 ? 0 : 1 });
        if (registryDeclarations.size !== 1) {
          return;
        }
        for (const factory of factories) {
          judge(factory);
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ContributorRegistry } from "../../../lib/registry.ts";\nexport function makeChatsSection(\n  contextTabs: ContributorRegistry<string>,\n  regions: ContributorRegistry<number>,\n): SectionDefinition {\n  return { id: "chats" };\n}\n',
      },
      expect: { count: 1, token: "makeChatsSection", messageIncludes: "ContributorRegistry parameters" },
      why: "the founding shape — the positional registry signature whose every new seam churned the door and both CT overrides",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ContributorRegistry } from "../../../lib/registry.ts";\nexport const makeChatsSection = (a: ContributorRegistry<string>, b: ContributorRegistry<number>): SectionDefinition => ({ id: "chats" });\n',
      },
      expect: { count: 1, token: "makeChatsSection", messageIncludes: "ContributorRegistry parameters" },
      why: "the OTHER authoring shape — an exported const arrow factory; keying only on `function` declarations would be half a policy",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/chat/lib/types.ts":
          'import type { ContributorRegistry } from "../../../lib/registry.ts";\nexport type ChatTabSeam = ContributorRegistry<string>;\nexport type ChatRegionSeam = ChatTabSeam;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ChatRegionSeam, ChatTabSeam } from "./types.ts";\nexport function makeChatsSection(a: ChatTabSeam, b: ChatRegionSeam): SectionDefinition {\n  return { id: "chats" };\n}\n',
      },
      expect: { count: 1, token: "makeChatsSection", messageIncludes: "ContributorRegistry parameters" },
      why: "THE ALIAS RED, at TWO hops: both seams arrive through imported aliases of the registry. Type structure follows the whole chain with no hop cap, where the legacy reader compared parameter TEXT and recorded the escape as a blessed limit",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/character/lib/characters-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport function makeCharactersSection(\n  chatsPane: (view: string) => null,\n  notesPane: (view: number) => null,\n): SectionDefinition {\n  return { id: "characters" };\n}\n',
      },
      expect: { count: 1, token: "makeCharactersSection", messageIncludes: "callable render-prop parameters" },
      why: "row 5's own tripwire: a SECOND foreign pane threaded as a render prop instead of minting the contribution seam",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/x/lib/panes.ts": "export type Pane = (view: string) => null;\n",
        "packages/client/src/features/x/lib/x-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { Pane } from "./panes.ts";\nexport function makeXSection(p: Pane, q: Pane): SectionDefinition {\n  return { id: "x" };\n}\n',
      },
      expect: { count: 1, token: "makeXSection", messageIncludes: "callable render-prop parameters" },
      why: "THE ALIASED RENDER PROP: a named function type is the same threaded pane. Reading the parameter's callable STRUCTURE catches it where a FunctionTypeNode syntax check does not",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/x/lib/x-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ContributorRegistry } from "../../../lib/registry.ts";\nexport function makeXSection(\n  a: ContributorRegistry<string>,\n  b: ContributorRegistry<number>,\n  p: (v: string) => null,\n  q: (v: number) => null,\n): SectionDefinition {\n  return { id: "x" };\n}\n',
      },
      expect: { count: 2 },
      why: "both arms are independent — a factory that trips both reports both, so fixing one cannot silence the other",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/chat/lib/types.ts":
          'import type { ContributorRegistry } from "../../../lib/registry.ts";\nexport type T10 = ContributorRegistry<string>;\nexport type T9 = T10;\nexport type T8 = T9;\nexport type T7 = T8;\nexport type T6 = T7;\nexport type T5 = T6;\nexport type T4 = T5;\nexport type T3 = T4;\nexport type T2 = T3;\nexport type T1 = T2;\nexport type T0 = T1;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { T0 } from "./types.ts";\nexport function makeChatsSection(a: T0, b: T0): SectionDefinition {\n  return { id: "chats" };\n}\n',
      },
      expect: { count: 1, token: "makeChatsSection", messageIncludes: "ContributorRegistry parameters" },
      why: "THE RETIRED HOP CAP: an eleven-hop alias chain is still the same seam. The legacy resolver threw a TOOL ERROR past eight hops — it refused honest authoring instead of judging it — and reading the resolved type has no budget to exceed",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/chat/lib/types.ts":
          'import type { ContributorRegistry } from "../../../lib/registry.ts";\nexport type ChatTabSeam = ContributorRegistry<string>;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ChatTabSeam } from "./types.ts";\nexport function makeChatsSection(a: ChatTabSeam, pane: (view: string) => null): SectionDefinition {\n  return { id: "chats" };\n}\n',
      },
      why: "the ALIAS resolution's green half: ONE aliased registry beside ONE render prop is §12 row 5 Arm A — resolving structure widens what the arms SEE, never what they accuse",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ContributorRegistry } from "../../../lib/registry.ts";\ninterface ChatsSectionContributors {\n  readonly contextTabs: ContributorRegistry<string>;\n  readonly surfaces: ContributorRegistry<number>;\n}\nexport function makeChatsSection({ contextTabs, surfaces }: ChatsSectionContributors): SectionDefinition {\n  void contextTabs;\n  void surfaces;\n  return { id: "chats" };\n}\n',
      },
      why: "THE REMEDY — the seams delivered as ONE named-field bundle parameter; a further seam is a field, not a signature edit. The bundle interface is not itself a registry, so it must not match",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/home/lib/home-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ContributorRegistry } from "../../../lib/registry.ts";\nexport function makeHomeSection(tiles: ContributorRegistry<string>): SectionDefinition {\n  void tiles;\n  return { id: "home" };\n}\n',
      },
      why: "the live home factory shape: ONE registry — the floor case, must stay legal unmodified",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/home/lib/home-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport function makeHomeSection(): SectionDefinition {\n  return { id: "home" };\n}\n',
        "packages/client/src/features/x/lib/x-thing.ts":
          'import type { ContributorRegistry } from "../../../lib/registry.ts";\ninterface SomethingElse {\n  readonly id: string;\n}\nexport function makeXSection(a: ContributorRegistry<string>, b: ContributorRegistry<number>): SomethingElse {\n  void a;\n  void b;\n  return { id: "x" };\n}\n',
      },
      why: "DECLARED SCOPE: the rule is about SECTION factories — a two-registry function returning anything else is not this policy's subject, and the section population proves that by TYPE rather than by a return-text match",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/home/lib/home-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport function makeHomeSection(): SectionDefinition {\n  return { id: "home" };\n}\n',
        "packages/client/src/features/x/lib/x-section.tsx":
          'import type { ContributorRegistry } from "../../../lib/registry.ts";\nexport function makeXSection(a: ContributorRegistry<string>, b: ContributorRegistry<number>) {\n  void a;\n  void b;\n  return { id: "x" };\n}\n',
      },
      why: "THE DECLARED LIMIT, written down: an UNANNOTATED return type has no canonical section identity to resolve, so the factory is not in the population — all live factories annotate, and G1's co-location keeps them findable",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/x/lib/x-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport function makeXSection(a: ForeignSeam, b: ForeignSeam): SectionDefinition {\n  void a;\n  void b;\n  return { id: "x" };\n}\ndeclare type ForeignSeam = unknown;\n',
      },
      why: "THE RESIDUAL REACH LIMIT, honestly scoped: a parameter type that resolves to no declaration cannot be proven to be the registry, so it is not judged — a DECLARED alias now reds, and that row is a mustFlag above",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/chat/lib/types.ts": "export type A = B;\nexport type B = A;\n",
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { A, B } from "./types.ts";\nexport function makeChatsSection(a: A, b: B): SectionDefinition {\n  return { id: "chats" };\n}\n',
      },
      why: "THE RETIRED CYCLE REFUSAL: a circular alias pair has no resolvable declaration, so it is simply not the registry. The legacy resolver walked the chain itself and threw a tool error; the checker answers this without recursion of ours, and a failed alias is not an accusation",
    },
  ],
});
