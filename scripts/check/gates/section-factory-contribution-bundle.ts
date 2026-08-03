// Gate: section-factory-contribution-bundle (client-architecture-lockdown.md §12 row 5) — the WALL under
// the §12 row-5 tripwire, which shipped as prose ("≥2 foreign panes ⇒ mint a contribution seam instead")
// with an Enforced-by column no gate could honor: `client-features-no-cross` forces the door, it cannot
// COUNT what arrives through it. Two arms over an exported `SectionDefinition`-returning factory:
// (1) BUNDLE — >1 parameter typed `ContributorRegistry<…>`: every new seam churns the positional signature
//     and all three call sites (the door + the two CT overrides); collapse them into ONE named-field param;
// (2) ARITY TRIPWIRE — >1 FUNCTION-typed (render-prop) parameter: row 5's own rule — one foreign pane
//     projected into a host is Arm A, two is a contribution seam wearing a prop.
// DECLARED LIMITS (each a mustPass row): an UNANNOTATED return type is invisible (no checker walk — the
// three live factories all annotate); a registry or render prop reached through a type ALIAS is invisible
// (the reader is literal-shape, per GATE-AUTHORING §5). The name-keyed blindness (GATE-AUTHORING §4 rule 6)
// is covered by the finalize tripwire: both keyed type names must still be exported from their declaring
// modules, and the tree must still hold ≥1 subject.
import type { Node, ParameterDeclaration, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Violation } from "../harness.ts";
import { fileLoaded } from "../pass.ts";

const CLIENT_SRC = "/packages/client/src/";
const GATE_SELF = "scripts/check/gates/section-factory-contribution-bundle.ts";

/** The two type names this gate is keyed on, each with the module that DECLARES it (never a re-export —
 *  GATE-AUTHORING §9: a barrel re-export is not a declaration). A rename here silently kills the gate, so
 *  finalize reds when either name stops being exported from its home. */
const SECTION_DEF = "SectionDefinition";
const SECTION_DEF_HOME = "packages/client/src/state/section-registry.ts";
const REGISTRY = "ContributorRegistry";
const REGISTRY_HOME = "packages/client/src/lib/registry.ts";

/** `ContributorRegistry` / `ContributorRegistry<X>` written literally as the parameter's type. A BUNDLE
 *  (a named interface, or an inline `{ a: ContributorRegistry<…>; … }` type literal) is not this shape —
 *  which is exactly the remedy, so it must not match. */
const REGISTRY_TYPE_RE = /^ContributorRegistry\s*(?:<|$)/u;

let factoriesSeen = 0;

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function isRegistryParam(p: ParameterDeclaration): boolean {
  const t = p.getTypeNode();
  return t !== undefined && REGISTRY_TYPE_RE.test(t.getText().trim());
}

/** A render-prop parameter: the type is written as a FUNCTION type (`(view: V) => ReactNode`). */
function isRenderPropParam(p: ParameterDeclaration): boolean {
  const t = p.getTypeNode();
  return t !== undefined && TsNode.isFunctionTypeNode(t);
}

type Factory = {
  readonly name: string;
  readonly line: number;
  readonly params: readonly ParameterDeclaration[];
};

/** The exported `SectionDefinition`-returning factory this node declares, or undefined. Covers both
 *  authoring shapes: `export function make…(): SectionDefinition` and an exported const holding an
 *  arrow/function expression with the same annotated return. */
function factoryOf(node: Node): Factory | undefined {
  if (TsNode.isFunctionDeclaration(node)) {
    const name = node.getName();
    if (name === undefined || !node.hasExportKeyword() || node.getReturnTypeNode()?.getText() !== SECTION_DEF) {
      return;
    }
    return { name, line: node.getStartLineNumber(), params: node.getParameters() };
  }
  if (!TsNode.isVariableDeclaration(node)) {
    return;
  }
  const init = node.getInitializer();
  if (init === undefined || !(TsNode.isArrowFunction(init) || TsNode.isFunctionExpression(init))) {
    return;
  }
  if (node.getVariableStatement()?.hasExportKeyword() !== true || init.getReturnTypeNode()?.getText() !== SECTION_DEF) {
    return;
  }
  return { name: node.getName(), line: node.getStartLineNumber(), params: init.getParameters() };
}

const BUNDLE_MSG = (f: Factory, names: readonly string[]): string =>
  `\`${f.name}\` takes ${names.length} \`${REGISTRY}\` parameters (${names.map((n) => `\`${n}\``).join(", ")}) — a section ` +
  "factory's contributor seams ride ONE named-field bundle parameter, so growing a seam is a FIELD, not an " +
  "arity churn through the door and every CT that rebuilds the section — client-architecture-lockdown.md §12 row 5.";

const RENDER_PROP_MSG = (f: Factory, names: readonly string[]): string =>
  `\`${f.name}\` takes ${names.length} render-prop parameters (${names.map((n) => `\`${n}\``).join(", ")}) — ONE foreign ` +
  "pane projected into a host is the door-threaded render prop (§12 row 5, Arm A); TWO is a contribution seam " +
  "wearing a prop. Mint the contributor registry and assemble it at the door — client-architecture-lockdown.md §12 row 5.";

function checkFactory(f: Factory, path: string, out: Violation[]): void {
  const registries = f.params.filter(isRegistryParam).map((p) => p.getName());
  if (registries.length > 1) {
    out.push({ file: rel(path), line: f.line, message: BUNDLE_MSG(f, registries) });
  }
  const renderProps = f.params.filter(isRenderPropParam).map((p) => p.getName());
  if (renderProps.length > 1) {
    out.push({ file: rel(path), line: f.line, message: RENDER_PROP_MSG(f, renderProps) });
  }
}

/** The name-keyed blindness tripwire (GATE-AUTHORING §4 rule 6): this gate matches two type names by TEXT,
 *  so a rename of either turns it into a no-op reporting ✓ forever. Guarded on the declaring modules as
 *  real-tree anchors, so the gate's own synthetic examples never trip it. */
function checkOwnBlindness(ctx: GateRunCtx): void {
  const anchors: readonly (readonly [string, string])[] = [
    [SECTION_DEF_HOME, SECTION_DEF],
    [REGISTRY_HOME, REGISTRY],
  ];
  let anchored = false;
  for (const [home, name] of anchors) {
    if (!fileLoaded(ctx, home)) {
      continue;
    }
    anchored = true;
    const sf = ctx.project.getSourceFile(`${ctx.root}/${home}`);
    if (sf?.getExportedDeclarations().has(name) !== true) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message:
          `this gate is keyed on the type name \`${name}\`, which ${home} no longer exports — the match is by TEXT, so ` +
          `the rename left the whole gate green and silent. Re-point the name (and its home) in ${GATE_SELF} ` +
          "— scripts/check/GATE-AUTHORING.md §4.",
      });
    }
  }
  if (anchored && factoriesSeen === 0) {
    ctx.report({
      file: GATE_SELF,
      line: 1,
      column: 0,
      message:
        `no exported \`${SECTION_DEF}\`-returning factory exists under packages/client/src — this gate's SUBJECT has ` +
        "vanished (the factory posture was replaced, or the return annotation was dropped), so every arm now matches " +
        `nothing. Re-point or retire the gate in ${GATE_SELF} — scripts/check/GATE-AUTHORING.md §4.`,
    });
  }
}

export const gate: GateDescriptor = {
  name: "section-factory-contribution-bundle",
  docRow: "client-architecture-lockdown.md §12 row 5",
  status: "active",
  // Per-file verdicts (the arity of ONE factory), but finalize's blindness tripwire is whole-tree — it
  // self-guards on the declaring-module anchors, which a changed-set run simply does not load.
  scopeSafety: "incremental-safe",
  message:
    "a section factory grew a positional contributor signature: >1 `ContributorRegistry` parameter (collapse them into ONE named-field bundle) or >1 render-prop parameter (≥2 foreign panes ⇒ mint a contribution seam). See client-architecture-lockdown.md §12 row 5.",
  fix: "bundle the registries into one named-field parameter (`make<X>Section({ contextTabs, surfaces, … })`); for a second foreign pane, mint a contributor registry and assemble it at the main.tsx door.",
  scanRoot: (p) => p.includes("packages/client/src/"),
  kinds: [SyntaxKind.FunctionDeclaration, SyntaxKind.VariableDeclaration],
  begin: () => {
    factoriesSeen = 0;
  },
  visit: (node, sf: SourceFile, ctx) => {
    if (!sf.getFilePath().includes(CLIENT_SRC)) {
      return;
    }
    const factory = factoryOf(node);
    if (factory === undefined) {
      return;
    }
    factoriesSeen += 1;
    const out: Violation[] = [];
    checkFactory(factory, sf.getFilePath(), out);
    for (const v of out) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project") {
      return;
    }
    checkOwnBlindness(ctx);
  },
  mustFlag: [
    {
      files:
        "export function makeChatsSection(\n" +
        "  contextTabs: ContributorRegistry<ContextTabDef<ChatContextState>>,\n" +
        "  regions: ContributorRegistry<ContextRegionDef<ChatContextState>>,\n" +
        "): SectionDefinition {\n  return null as never;\n}\n",
      at: "packages/client/src/features/chat/lib/chats-section.tsx",
      expect: { count: 1, messageIncludes: "named-field bundle" },
      why: "the founding shape — the 4-registry positional signature whose every new seam churned the door and both CT overrides",
    },
    {
      files:
        "export const makeChatsSection = (\n" +
        "  a: ContributorRegistry<X>,\n" +
        "  b: ContributorRegistry<Y>,\n" +
        "): SectionDefinition => null as never;\n",
      at: "packages/client/src/features/chat/lib/chats-section.tsx",
      expect: { count: 1, messageIncludes: "named-field bundle" },
      why: "the OTHER authoring shape — an exported const arrow factory; keying only on `function` declarations would be half a gate",
    },
    {
      files:
        "export function makeCharactersSection(\n" +
        "  chatsPane: (view: ChatsWithCharacterView) => ReactNode,\n" +
        "  notesPane: (view: NotesView) => ReactNode,\n" +
        "): SectionDefinition {\n  return null as never;\n}\n",
      at: "packages/client/src/features/character/lib/characters-section.tsx",
      expect: { count: 1, messageIncludes: "wearing a prop" },
      why: "row 5's own tripwire: a SECOND foreign pane threaded as a render prop instead of minting the contribution seam",
    },
    {
      files:
        "export function makeXSection(\n" +
        "  a: ContributorRegistry<X>,\n" +
        "  b: ContributorRegistry<Y>,\n" +
        "  p: (v: V) => ReactNode,\n" +
        "  q: (v: W) => ReactNode,\n" +
        "): SectionDefinition {\n  return null as never;\n}\n",
      at: "packages/client/src/features/x/lib/x-section.tsx",
      expect: { count: 2 },
      why: "both arms are independent — a factory that trips both reports both, so fixing one cannot silence the other",
    },
    {
      files: {
        [REGISTRY_HOME]: "export const somethingElse = 1;\n",
        [SECTION_DEF_HOME]: "export interface SectionDefinition {\n  readonly id: string;\n}\n",
        "packages/client/src/features/x/lib/x-section.tsx":
          "export function makeXSection(a: ContributorRegistry<X>): SectionDefinition {\n  return null as never;\n}\n",
      },
      expect: { count: 1, messageIncludes: "no longer exports" },
      why: "THE BLINDNESS TRIPWIRE (GATE-AUTHORING §4 rule 6): the keyed type name stopped being exported from its declaring module — a rename that would otherwise leave every arm matching nothing while reporting ✓",
    },
    {
      files: {
        [REGISTRY_HOME]: "export interface ContributorRegistry<Def> {\n  readonly name: string;\n}\n",
        [SECTION_DEF_HOME]: "export interface SectionDefinition {\n  readonly id: string;\n}\n",
      },
      expect: { count: 1, messageIncludes: "SUBJECT has" },
      why: "the OTHER blindness: both names still resolve but the tree holds no section FACTORY at all — the posture was replaced (or the return annotation dropped) and the gate is guarding an empty set",
    },
  ],
  mustPass: [
    {
      files:
        "export function makeChatsSection({ contextTabs, contextRegions, surfaces, toolRenderers }: ChatsSectionContributors): SectionDefinition {\n" +
        "  return null as never;\n}\n",
      at: "packages/client/src/features/chat/lib/chats-section.tsx",
      why: "THE REMEDY — four seams delivered as ONE named-field bundle parameter; a fifth seam is a field, not a signature edit",
    },
    {
      files:
        "export function makeCharactersSection(\n" +
        "  detail: ContributorRegistry<CharacterDetailContribution>,\n" +
        "  chatsPane: (view: ChatsWithCharacterView) => ReactNode,\n" +
        "): SectionDefinition {\n  return null as never;\n}\n",
      at: "packages/client/src/features/character/lib/characters-section.tsx",
      why: "the live characters factory: ONE registry + ONE render prop (§12 row 5 Arm A) — legal, and must stay legal unmodified",
    },
    {
      files: "export function makeHomeSection(tiles: ContributorRegistry<HomeTileContribution>): SectionDefinition {\n  return null as never;\n}\n",
      at: "packages/client/src/features/home/lib/home-section.tsx",
      why: "the live home factory: ONE registry — the floor case, must stay legal unmodified",
    },
    {
      files: "export function makeXSection(a: ContributorRegistry<X>, b: ContributorRegistry<Y>): SomethingElse {\n  return null as never;\n}\n",
      at: "packages/client/src/features/x/lib/x-thing.ts",
      why: "DECLARED LIMIT + scope: the rule is about SECTION factories — a two-registry function returning anything else is not this gate's subject",
    },
    {
      files: "export function makeXSection(a: ContributorRegistry<X>, b: ContributorRegistry<Y>) {\n  return null as never;\n}\n",
      at: "packages/client/src/features/x/lib/x-section.tsx",
      why: "DECLARED LIMIT: an UNANNOTATED return type is invisible (the reader is literal-shape, GATE-AUTHORING §5) — all three live factories annotate, and G1's co-location keeps them findable",
    },
    {
      files: "export function makeXSection(a: ChatSeams, b: ChatSeams): SectionDefinition {\n  return null as never;\n}\n",
      at: "packages/client/src/features/x/lib/x-section.tsx",
      why: "DECLARED LIMIT: a registry reached through a type ALIAS is invisible to the literal-shape reader — recorded, not silently assumed away",
    },
    {
      files: {
        [REGISTRY_HOME]: "export interface ContributorRegistry<Def> {\n  readonly name: string;\n}\n",
        [SECTION_DEF_HOME]: "export interface SectionDefinition {\n  readonly id: string;\n}\n",
        "packages/client/src/features/home/lib/home-section.tsx":
          "export function makeHomeSection(tiles: ContributorRegistry<T>): SectionDefinition {\n  return null as never;\n}\n",
      },
      why: "the blindness tripwire EARNED: both keyed names still exported from their declaring modules and ≥1 subject factory on the tree — neither finalize arm fires",
    },
  ],
};
