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
// factory population is the shared `registryDefinitionFacts.section` provider, so the return annotation must
// resolve to the canonical exported `SectionDefinition`. A parameter is callable when its type HAS call
// signatures, so an aliased function type is a render prop too.
//
// REGISTRY IDENTITY IS ONE DECLARATION IN ONE MODULE, NEVER A NAME. The canonical registry is whatever
// `packages/client/src/lib/registry.ts` exports as `ContributorRegistry`; a parameter is a registry when
// its resolved TYPE declares itself at THAT node. Consequences, each with its own proof row: a barrel
// re-export, a renamed import and an alias chain of any depth all still ARE the registry; an unrelated
// exported interface of the same name in another feature file is NOT — and, critically, it does not
// disturb this policy at all, because the name was never the key. If the declaring module is gone, or
// stops exporting exactly one `ContributorRegistry` type, the receipt goes unresolved and the verdict is
// withheld: that is this policy's rename tripwire, and it is the runtime's refusal rather than a finding
// the policy has to remember to raise.
//
// The canonical `SectionDefinition` is the shared fact's own type target, so a tree that holds no factory
// at all takes the factory receipt to zero members and is withheld the same way.
//
// FAMILY: `registry-definitions` — a REAL shared-reader family, and the reader is
// `lib/registry-fact.ts#registryDefinitionFacts` (module + function), the one provider every registry
// policy takes its definition corpus from; this policy consumes its `section` kind.
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot: (p) => p.includes("packages/client/src/")` is
// exactly `@client`.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 1,319 admitted on both sides, symmetric difference ZERO in both directions.
// LEGACY SHA: (ef18f3a14^) — the conversion's parent.
import type { Node as MorphNode, ParameterDeclaration, Type } from "ts-morph";
import { Node } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { resolveExportedDeclarations } from "../lib/reference-fact.ts";
import { definitionName } from "../lib/registry-definition-anchor.ts";
import { registryDefinitionFacts } from "../lib/registry-fact.ts";

const REGISTRY = "ContributorRegistry";
/** The ONE module that declares the contributor registry. A rename here is the tripwire, not a silent no-op. */
const REGISTRY_HOME = "packages/client/src/lib/registry.ts";
const FACTORY_POPULATION = "SectionDefinition factory";

const MESSAGE =
  "a section factory grew a positional contributor signature: more than one `ContributorRegistry` parameter (collapse " +
  "them into ONE named-field bundle) or more than one callable render-prop parameter (two foreign panes means minting a " +
  "contribution seam). See client-architecture-lockdown.md §12 row 5.";
const FIX =
  "bundle the registries into one named-field parameter (`make<X>Section({ contextTabs, surfaces, … })`); " +
  "for a second foreign pane, mint a contributor registry and assemble it at the main.tsx door. A " +
  "deliberate site is waived with `@orb-waive section-factory-contribution-bundle(<position>): <reason>` " +
  "on the line above, where <position> is the excess parameter's own name.";

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

/** The ONE `ContributorRegistry` type the declaring module exports, or undefined when it cannot be bound.
 *
 *  This is a MODULE binding, not a name search: an unrelated exported interface of the same name anywhere
 *  else in the client package is a different declaration and never reaches this policy. The shared export reader
 *  resolves through the module's own re-exports, so the registry may move behind a barrel without a rename. */
function canonicalRegistry(ctx: GatePolicyContext): MorphNode | undefined {
  if (!ctx.files.some((file) => ctx.relativePath(file) === REGISTRY_HOME)) {
    return;
  }
  const exported = resolveExportedDeclarations(ctx.sourceFile(REGISTRY_HOME), REGISTRY);
  const declarations = (exported.kind === "resolved" ? exported.value : []).filter(
    (declaration) => Node.isInterfaceDeclaration(declaration) || Node.isTypeAliasDeclaration(declaration),
  );
  return declarations.length === 1 ? declarations[0] : undefined;
}

/** The home has exactly one declaration. Comparing its checker symbol preserves structural TYPE identity
 *  without expanding declarations or preferring a type alias over the underlying registry. */
function declaresCanonicalRegistry(type: Type | undefined, canonical: MorphNode): boolean {
  const symbol = type?.getSymbol();
  return symbol !== undefined && symbol.compilerSymbol === canonical.getSymbol()?.compilerSymbol;
}

export const gate = defineGate({
  id: "section-factory-contribution-bundle",
  family: "registry-definitions",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [registryDefinitionFacts.section],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // EACH ARM ANCHORS ON ITS OWN SUBJECT — the SECOND parameter of its kind, the one that makes the
    // signature illegal. Anchoring both on the factory DECLARATION (as this policy did until 2026-09-11)
    // gave the two findings the same file, offset and position token, differing only in `message` — which
    // the waiver engine never reads. One `@orb-waive` marker in that carrier then matched two candidates,
    // the central engine called it over-broad and suppressed NEITHER, so a factory tripping both arms was
    // unwaivable by construction and this ordinary policy had no working door (#1954). Anchoring on the
    // offending parameter keeps the arms independently waivable AND points the diagnostic at what to delete;
    // the message still names the factory. No explicit token/offset: the runtime's own derivation takes the
    // first identifier of a parameter's text, which is its name (or, for a bundle pattern, its first field).
    const judge = (definition: RegistryDefinitionFact, registry: MorphNode): void => {
      const name = definitionName(definition.declaration);
      const registries: ParameterDeclaration[] = [];
      const callables: ParameterDeclaration[] = [];
      for (const parameter of factoryParameters(definition)) {
        const type = annotatedType(parameter);
        if (declaresCanonicalRegistry(type, registry)) {
          registries.push(parameter);
        } else if ((type?.getCallSignatures().length ?? 0) > 0) {
          callables.push(parameter);
        }
      }
      const accuse = (offenders: readonly ParameterDeclaration[], detail: string): void => {
        const excess = offenders[1];
        if (excess === undefined) {
          return;
        }
        ctx.report.node(excess, {
          message: `${MESSAGE} \`${name}\` takes ${offenders.length} ${detail} (${offenders.map((parameter) => parameter.getName()).join(", ")}).`,
          fix: FIX,
        });
      };
      accuse(registries, `${REGISTRY} parameters`);
      accuse(callables, "callable render-prop parameters");
    };

    return {
      evaluate: () => {
        const sections = ctx.fact(registryDefinitionFacts.section);
        const factories = sections.definitions.filter(({ shape }) => shape === "factory");
        const registry = canonicalRegistry(ctx);
        ctx.receipt({ kind: "population", source: FACTORY_POPULATION, members: factories.length, unresolved: 0 });
        ctx.receipt({ kind: "population", source: REGISTRY, members: registry === undefined ? 0 : 1, unresolved: registry === undefined ? 1 : 0 });
        if (registry === undefined) {
          return;
        }
        for (const factory of factories) {
          judge(factory, registry);
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
      expect: { count: 1, token: "regions", messageIncludes: "ContributorRegistry parameters" },
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
      expect: { count: 1, token: "b", messageIncludes: "ContributorRegistry parameters" },
      why: "the OTHER authoring shape — an exported const arrow factory; keying only on `function` declarations would be half a policy",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/lib/index.ts": 'export type { ContributorRegistry } from "./registry.ts";\n',
        "packages/client/src/features/chat/lib/types.ts":
          'import type { ContributorRegistry as Seam } from "../../../lib/index.ts";\nexport type ChatTabSeam = Seam<string>;\nexport type ChatRegionSeam = ChatTabSeam;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ChatRegionSeam, ChatTabSeam } from "./types.ts";\nexport function makeChatsSection(a: ChatTabSeam, b: ChatRegionSeam): SectionDefinition {\n  return { id: "chats" };\n}\n',
      },
      expect: { count: 1, token: "b", messageIncludes: "ContributorRegistry parameters" },
      why: "THE IDENTITY RED: both seams reach the registry through a BARREL RE-EXPORT, a renamed import, and two alias hops. Type identity is the declaration, so every spelling on the way is irrelevant — the legacy reader compared parameter TEXT and recorded the escape as a blessed limit",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/character/lib/characters-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport function makeCharactersSection(\n  chatsPane: (view: string) => null,\n  notesPane: (view: number) => null,\n): SectionDefinition {\n  return { id: "characters" };\n}\n',
      },
      expect: { count: 1, token: "notesPane", messageIncludes: "callable render-prop parameters" },
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
      expect: { count: 1, token: "q", messageIncludes: "callable render-prop parameters" },
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
      why: "both arms are independent — a factory that trips both reports both, so fixing one cannot silence the other, and each anchors on ITS OWN excess parameter (`b`, `q`) so the two findings stay separately waivable",
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
      expect: { count: 1, token: "b", messageIncludes: "ContributorRegistry parameters" },
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
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/x/lib/x-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\ninterface ContributorRegistry<Def> {\n  readonly local: Def;\n}\nexport function makeXSection(a: ContributorRegistry<string>, b: ContributorRegistry<number>): SectionDefinition {\n  void a;\n  void b;\n  return { id: "x" };\n}\n',
      },
      why: "THE COUNTERFACTUAL: two parameters spelled `ContributorRegistry` whose type is a LOCAL declaration of that name are not the canonical contributor registry, so the bundle arm must not fire. Identity is the declaration this policy resolved, never the word at the call site",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/lib/registry.ts": "export interface ContributorRegistry<Def> {\n  readonly name: string;\n  readonly def: Def;\n}\n",
        "packages/client/src/features/x/lib/impostor.ts": "export interface ContributorRegistry<Def> {\n  readonly other: Def;\n}\n",
        "packages/client/src/features/x/lib/x-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport type { ContributorRegistry } from "./impostor.ts";\nimport type { ContributorRegistry as Real } from "../../../lib/registry.ts";\nexport function makeXSection(a: ContributorRegistry<string>, b: ContributorRegistry<number>, c: Real<string>): SectionDefinition {\n  void a;\n  void b;\n  void c;\n  return { id: "x" };\n}\n',
      },
      why: "THE SAME-NAME/WRONG-MODULE COUNTERFACTUAL: another client module EXPORTS an interface called `ContributorRegistry`. Two parameters typed with it are not two registry seams, the ONE parameter typed with the real registry is, and the impostor does not disturb the binding at all — the name was never the key",
    },
  ],
});
