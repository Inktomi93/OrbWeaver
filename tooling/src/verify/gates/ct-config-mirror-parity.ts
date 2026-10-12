// Policy: ct-config-mirror-parity — the browser-CT door mirrors the production door, membership AND order.
// Families: config sections, home tiles, chat settings sections, chat surfaces, tool renderers, slash commands, palette sources,
// corpus context tabs, chrome widgets and config groups; a CT export that IS the production declaration passes, a hand
// list must match row for row. A story module mints a door registry only through `isolationRegistry` with a reason.
// A singleton: the mirrors are one CT composition contract and share no meaningful reader with another policy.
import type {
  CallExpression,
  Node as MorphNode,
  ObjectLiteralExpression,
  PropertyAssignment,
  SourceFile,
  Symbol as TsSymbol,
  Type,
  VariableDeclaration,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "../../floor/code-facts/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { readStringValue } from "../lib/ast-read.ts";
import { definitionField, definitionStringField } from "../lib/registry-definition-field.ts";
import { resolveAuthoredComposite } from "../lib/static-authored-value.ts";

const COMPOSE = "packages/client/src/compose";
const DOOR_SECTIONS = `${COMPOSE}/config-sections.ts`;
const DOOR_TILES = `${COMPOSE}/home-tiles.ts`;
const DOOR_CONTRIBUTORS = `${COMPOSE}/contributors.ts`;
const DOOR_GROUPS = `${COMPOSE}/authed-app.tsx`;
const CT_DOOR = "tests/support/browser/ct-door.ts";
const CT_GROUPS = "tests/support/browser/ct-config-groups.ts";
const CT_PROVIDERS = "tests/support/browser/ct-data-providers.tsx";
const CT_ISOLATION = "tests/support/browser/ct-isolation.ts";
const CHROME_REGISTRY = "realChromeRegistry";
/** Every module a CT or story reaches is judged for hand-minted door registries: the whole client test tree and
 *  the test support tree, except unit tests (which never mount a registry in a browser). */
const JUDGED_TREES = ["tests/client/**", "tests/support/**"] as const;
const UNIT_TEST_NAMES = ["*.test.ts", "*.test.tsx", "*.test-d.ts"] as const;
/** The factory and the exception are recognised by DECLARATION, never by import spelling or local name. */
const MINT = "createContributorRegistry";
const MINT_FILE = /(?:^|\/)lib\/registry\.ts$/u;
const ISOLATE = "isolationRegistry";
const ISOLATE_FILE = /(?:^|\/)ct-isolation\.ts$/u;
/** Fewer words than this cannot name what a story isolates. */
const MIN_ISOLATES_WORDS = 3;

const MESSAGE =
  "the browser-CT door has drifted from the production door: every registry the CT mounts must be the production " +
  "declaration or list the same rows in the same order (config sections by (anchor, nav.id, contribution id), config " +
  "groups by (group key, canonical export), every other list by its member expression). " +
  `The mirrors are ${CT_DOOR} and ${CT_GROUPS}; the harness ${CT_PROVIDERS} must consume them, never re-list a door registry. ` +
  `A registry of a door contribution type in a CT or story module is judged by its type, whatever its name: take it from ${CT_DOOR}, or declare a deliberate subset with isolationRegistry(name, isolates, members) from ${CT_ISOLATION}.`;
const FIX =
  `re-export the production declaration from ${CT_DOOR} instead of listing it; a derived section address is \`anchor\` plus \`nav.id\`, never the contribution id. ` +
  "In a CT or story module, replace a hand-minted registry of a door contribution type with the door export or isolationRegistry whose `isolates` text names what the story keeps apart.";

type RowReader = (declaration: VariableDeclaration) => readonly string[];

interface Family {
  readonly label: string;
  readonly name: string;
  readonly doorFile: string;
  readonly rows: RowReader;
}

function variable(source: SourceFile, name: string): VariableDeclaration {
  const declaration = source.getVariableDeclaration(name);
  if (declaration === undefined) {
    throw new Error(`${source.getBaseName()} has no ${name} declaration`);
  }
  return declaration;
}

function objectValue(node: MorphNode | undefined, label: string): ObjectLiteralExpression {
  if (node === undefined) {
    throw new Error(`${label} has no value`);
  }
  const resolved = resolveAuthoredComposite(node);
  if (resolved.kind === "unresolved" || !Node.isObjectLiteralExpression(resolved.value)) {
    throw new Error(`${label} is not an authored object literal`);
  }
  return resolved.value;
}

function findCanonicalVariable(node: MorphNode): VariableDeclaration | undefined {
  const origin = resolveModuleMemberOrigin(node);
  const stable = origin.kind === "unresolved" ? resolveStableExpression(node) : undefined;
  const declaration =
    origin.kind === "resolved" && origin.value.canonical.kind === "project"
      ? origin.value.canonical.declaration
      : stable?.trace.declarations.findLast(Node.isVariableDeclaration);
  return declaration !== undefined && Node.isVariableDeclaration(declaration) ? declaration : undefined;
}

function canonicalVariable(node: MorphNode, label: string): VariableDeclaration {
  const declaration = findCanonicalVariable(node);
  if (declaration === undefined) {
    throw new Error(`${label} does not resolve to one exported variable`);
  }
  return declaration;
}

function authoredString(object: ObjectLiteralExpression, field: string, label: string): string {
  const value = definitionStringField(object, field);
  if (value === undefined || value.kind === "unresolved") {
    throw new Error(`${label}.${field} is not an authored string`);
  }
  return value.value;
}

/** The authored member array of a registry call (`createContributorRegistry(name, [...])`) or of a bare array. */
function memberElements(declaration: VariableDeclaration): readonly MorphNode[] {
  const initializer = declaration.getInitializer();
  const members = initializer !== undefined && Node.isCallExpression(initializer) ? initializer.getArguments()[1] : initializer;
  if (members === undefined || !Node.isArrayLiteralExpression(members)) {
    throw new Error(`${declaration.getName()} has no authored member array`);
  }
  return members.getElements();
}

const memberRows: RowReader = (declaration) => memberElements(declaration).map((member) => member.getText().replaceAll(/\s+/gu, " "));

const sectionRows: RowReader = (declaration) =>
  memberElements(declaration).map((member) => {
    const contribution = canonicalVariable(member, member.getText());
    const contributionObject = objectValue(contribution.getInitializer(), contribution.getName());
    const anchor = authoredString(contributionObject, "anchor", contribution.getName());
    const sectionId = authoredString(contributionObject, "id", contribution.getName());
    const nav = objectValue(definitionField(contributionObject, "nav"), `${contribution.getName()}.nav`);
    const subId = authoredString(nav, "id", `${contribution.getName()}.nav`);
    return `${anchor}/${subId}=>${sectionId}`;
  });

const groupRows: RowReader = (declaration) => {
  const initializer = declaration.getInitializer();
  const object = objectValue(
    initializer !== undefined && Node.isCallExpression(initializer) ? initializer.getArguments()[2] : initializer,
    declaration.getName(),
  );
  return object.getProperties().map((property) => {
    if (!Node.isPropertyAssignment(property)) {
      throw new Error(`${declaration.getName()} contains a non-property group row`);
    }
    const value = property.getInitializer();
    if (value === undefined) {
      throw new Error(`${property.getName()} has no group value`);
    }
    return `${property.getName()}=>${canonicalVariable(value, property.getName()).getName()}`;
  });
};

const FAMILIES: readonly Family[] = [
  { label: "config sections", name: "configSections", doorFile: DOOR_SECTIONS, rows: sectionRows },
  { label: "home tiles", name: "homeTiles", doorFile: DOOR_TILES, rows: memberRows },
  { label: "chat settings sections", name: "chatSettingsSections", doorFile: DOOR_CONTRIBUTORS, rows: memberRows },
  { label: "chat surfaces", name: "chatSurfaceContributors", doorFile: DOOR_CONTRIBUTORS, rows: memberRows },
  { label: "tool renderers", name: "toolRenderers", doorFile: DOOR_CONTRIBUTORS, rows: memberRows },
  { label: "slash commands", name: "slashCommands", doorFile: DOOR_CONTRIBUTORS, rows: memberRows },
  { label: "palette sources", name: "commandPaletteSources", doorFile: DOOR_CONTRIBUTORS, rows: memberRows },
  { label: "corpus context tabs", name: "corpusContextTabs", doorFile: DOOR_CONTRIBUTORS, rows: memberRows },
  { label: "chrome widgets", name: "chromeWidgets", doorFile: DOOR_CONTRIBUTORS, rows: memberRows },
];

function multiset(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Membership first (multiset), then order: equal multisets in a different sequence name the first moved row. */
function differences(door: readonly string[], ct: readonly string[]): readonly string[] {
  const expected = multiset(door);
  const actual = multiset(ct);
  const membership = [...new Set([...expected.keys(), ...actual.keys()])]
    .toSorted()
    .flatMap((key) => ((expected.get(key) ?? 0) === (actual.get(key) ?? 0) ? [] : [`${key} (door ${expected.get(key) ?? 0}, CT ${actual.get(key) ?? 0})`]));
  if (membership.length > 0) {
    return membership;
  }
  const at = door.findIndex((row, index) => row !== ct[index]);
  return at === -1 ? [] : [`order differs at position ${at + 1}: door has ${door[at]}, CT has ${ct[at]}`];
}

function registryName(declaration: VariableDeclaration): string | undefined {
  const initializer = declaration.getInitializer();
  const first = initializer !== undefined && Node.isCallExpression(initializer) ? initializer.getArguments()[0] : undefined;
  return first !== undefined && Node.isStringLiteral(first) ? first.getLiteralText() : undefined;
}

const GROUP_DOOR = 'export const groupA = {};\nexport const configGroups = createRegistry("config-groups", IDS, { a: groupA });\n';
const GROUP_CT = "const groupA = {};\nconst REAL_CONFIG_GROUPS = { a: groupA };\n";
const GROUP_DOOR_TWO = 'const groupA = {};\nconst groupB = {};\nconst configGroups = createRegistry("config-groups", IDS, { a: groupA, b: groupB });\n';
const SECTION_A = 'const navA = { id: "nav-a" };\nconst sectionA = { id: "section-a", anchor: "admin", nav: navA };\n';
const SECTION_B = 'const navB = { id: "nav-b" };\nconst sectionB = { id: "section-b", anchor: "admin", nav: navB };\n';
const DOOR_IMPORTS =
  'import { createContributorRegistry } from "../lib/registry.ts";\nimport type { SectionContribution, TileContribution } from "../lib/contribution-types.ts";\n';
const SECTIONS_CALL = (members: string): string =>
  `${DOOR_IMPORTS}export const configSections = createContributorRegistry<SectionContribution>("config-sections", [${members}]);\n`;
const TILES_DOOR = `${DOOR_IMPORTS}export const homeTiles = createContributorRegistry<TileContribution>("home-tiles", [tileA, tileB]);\n`;

const CONTRIBUTOR_NAMES = [
  "chatSettingsSections",
  "chatSurfaceContributors",
  "toolRenderers",
  "slashCommands",
  "commandPaletteSources",
  "corpusContextTabs",
  "chromeWidgets",
] as const;
type ContributorName = (typeof CONTRIBUTOR_NAMES)[number];

/** Registry-call families that live in `contributors.ts`, with the registry name each one is minted under. */
const CONTRIBUTOR_REGISTRIES: Readonly<Record<Exclude<ContributorName, "chromeWidgets">, string>> = {
  chatSettingsSections: "chat-settings-sections",
  chatSurfaceContributors: "chat-surface",
  toolRenderers: "tool-renderers",
  slashCommands: "slash-commands",
  commandPaletteSources: "command-palette-sources",
  corpusContextTabs: "corpus-context",
};

function contributorsDoor(members: Partial<Record<ContributorName, string>> = {}): string {
  return (
    DOOR_IMPORTS +
    CONTRIBUTOR_NAMES.map((name) => {
      const list = members[name] ?? "memberA, memberB";
      return name === "chromeWidgets"
        ? `export const chromeWidgets = [${list}];\n`
        : `export const ${name} = createContributorRegistry<SectionContribution>("${CONTRIBUTOR_REGISTRIES[name]}", [${list}]);\n`;
    }).join("")
  );
}

/** `ct-door.ts` re-exporting every production declaration, except the named ones, which it re-lists by hand. */
function ctDoor(handListed: Partial<Record<ContributorName | "configSections" | "homeTiles", string>> = {}): string {
  const reexport = (names: readonly string[], from: string): string => {
    const kept = names.filter((name) => !(name in handListed));
    return kept.length === 0 ? "" : `export { ${kept.join(", ")} } from "../../../${from}";\n`;
  };
  const hand = Object.entries(handListed)
    .map(([name, list]) =>
      name === "chromeWidgets" ? `export const chromeWidgets = [${list}];\n` : `export const ${name} = createContributorRegistry("x", [${list}]);\n`,
    )
    .join("");
  return `${SECTION_A}${SECTION_B}${reexport(["configSections"], DOOR_SECTIONS)}${reexport(["homeTiles"], DOOR_TILES)}${reexport(CONTRIBUTOR_NAMES, DOOR_CONTRIBUTORS)}${hand}`;
}

const PROVIDERS_CLEAN =
  'import { chromeWidgets } from "./ct-door.ts";\n' +
  'const realChromeRegistry = createContributorRegistry("chrome", assembleChrome({ sections, modals, widgets: chromeWidgets }));\n';

const LIB_REGISTRY = "packages/client/src/lib/registry.ts";
const LIB_TYPES = "packages/client/src/lib/contribution-types.ts";
/** The factory, three contribution types (two are door types) and the exception, declared where the real ones are. */
const VIRTUAL_LIB: Readonly<Record<string, string>> = {
  [LIB_REGISTRY]:
    "export interface ContributorRegistry<Def extends { readonly id: string }> {\n  readonly name: string;\n  readonly list: () => readonly Def[];\n}\n" +
    "export function createContributorRegistry<Def extends { readonly id: string }>(name: string, contributions: readonly Def[]): ContributorRegistry<Def> {\n  return { name, list: () => contributions };\n}\n",
  [LIB_TYPES]:
    "export interface TileContribution {\n  readonly id: string;\n  readonly title: string;\n}\n" +
    "export interface SectionContribution {\n  readonly id: string;\n  readonly anchor: string;\n}\n" +
    "export interface PlainEntry {\n  readonly id: string;\n  readonly note: number;\n}\n",
  [CT_ISOLATION]:
    'import type { ContributorRegistry } from "../../../packages/client/src/lib/registry.ts";\nimport { createContributorRegistry } from "../../../packages/client/src/lib/registry.ts";\n' +
    "export function isolationRegistry<Def extends { readonly id: string }>(name: string, _isolates: string, contributions: readonly Def[]): ContributorRegistry<Def> {\n  return createContributorRegistry<Def>(name, contributions);\n}\n",
};

function proofFiles(overrides: Partial<Readonly<Record<string, string>>> = {}): Readonly<Record<string, string>> {
  return {
    ...VIRTUAL_LIB,
    [DOOR_SECTIONS]: `${SECTION_A}${SECTION_B}${SECTIONS_CALL("sectionA, sectionB")}`,
    [DOOR_TILES]: TILES_DOOR,
    [DOOR_CONTRIBUTORS]: contributorsDoor(),
    [DOOR_GROUPS]: GROUP_DOOR,
    [CT_DOOR]: ctDoor(),
    [CT_GROUPS]: GROUP_CT,
    [CT_PROVIDERS]: PROVIDERS_CLEAN,
    ...overrides,
  };
}

const STORY_PATH = "tests/client/features/probe/_ct-stories.tsx";
const FROM_PROBE = "../../../../";
const importsFor = (prefix: string): string =>
  `import { createContributorRegistry } from "${prefix}packages/client/src/lib/registry.ts";\n` +
  `import type { PlainEntry, SectionContribution, TileContribution } from "${prefix}packages/client/src/lib/contribution-types.ts";\n`;
const MINT_IMPORT = importsFor(FROM_PROBE);
const ISOLATION_IMPORT = `import { isolationRegistry } from "../../../support/browser/ct-isolation.ts";\nimport type { PlainEntry, SectionContribution, TileContribution } from "${FROM_PROBE}packages/client/src/lib/contribution-types.ts";\n`;
const ISOLATES = "keeps the probe tile apart from the production launcher grid";

/** The clean proof tree plus one module of the judged trees. */
function storyFiles(source: string, path: string = STORY_PATH, more: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return proofFiles({ ...more, [path]: source });
}

type Required = (path: string) => SourceFile;
type Report = (node: MorphNode, message: string) => void;

/** Each family's `ct-door.ts` export against its `compose/` declaration; returns the door's registry names. */
function checkFamilies(required: Required, report: Report): ReadonlySet<string> {
  const ctDoorSource = required(CT_DOOR);
  const exported = ctDoorSource.getExportedDeclarations();
  const doorRegistryNames = new Set<string>();
  for (const family of FAMILIES) {
    const door = variable(required(family.doorFile), family.name);
    const doorName = registryName(door);
    if (doorName !== undefined) {
      doorRegistryNames.add(doorName);
    }
    const mirror = exported.get(family.name)?.find(Node.isVariableDeclaration);
    if (mirror === undefined) {
      report(ctDoorSource, `${family.label}: ${CT_DOOR} does not export ${family.name}.`);
    } else if (mirror !== door) {
      const diff = differences(family.rows(door), family.rows(mirror));
      if (diff.length > 0) {
        report(mirror, `${family.label} differences: ${diff.join("; ")}.`);
      }
    }
  }
  return doorRegistryNames;
}

function checkGroups(required: Required, report: Report): void {
  const mirror = variable(required(CT_GROUPS), "REAL_CONFIG_GROUPS");
  const diff = differences(groupRows(variable(required(DOOR_GROUPS), "configGroups")), groupRows(mirror));
  if (diff.length > 0) {
    report(mirror, `config group differences: ${diff.join("; ")}.`);
  }
}

/** What the files the policy judges declare, gathered by the visitor (no gate-owned walk). */
interface HarnessFacts {
  readonly registryCalls: CallExpression[];
  chromeWidgets: PropertyAssignment | undefined;
  /** Registry mints in the production door files: their element types are the door contribution types. */
  readonly doorMints: CallExpression[];
  /** Registry mints anywhere else in the judged trees. */
  readonly storyMints: CallExpression[];
  /** `isolationRegistry` calls in the judged trees: the named isolation exceptions. */
  readonly isolations: CallExpression[];
}

/** `(name, members)` and `(name, isolates, members)`. */
const MINT_ARITY = 2;
const REGISTRY_ARITIES: ReadonlySet<number> = new Set([MINT_ARITY, MINT_ARITY + 1]);

/** A members argument is a list: never an object, a function or a literal. */
const NON_LIST_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ObjectLiteralExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateExpression,
  SyntaxKind.NumericLiteral,
  SyntaxKind.TrueKeyword,
  SyntaxKind.FalseKeyword,
  SyntaxKind.NullKeyword,
  SyntaxKind.RegularExpressionLiteral,
]);

/** The factory takes `(name, members)` and the exception `(name, isolates, members)`: only a two- or three-argument
 *  call through a name or a member read in any spelling whose last argument could be a list can be one, so the checker resolves
 *  those and no other call. */
function couldBeRegistryCall(call: CallExpression): boolean {
  const callee = call.getExpression();
  const args = call.getArguments();
  const last = args.at(-1);
  return (
    REGISTRY_ARITIES.has(args.length) &&
    last !== undefined &&
    !NON_LIST_KINDS.has(last.getKind()) &&
    (Node.isIdentifier(callee) || staticMemberAccess(callee) !== undefined)
  );
}

/** The callee resolved to its project declaration through imports, re-exports, namespaces and immutable aliases. */
function callsDeclared(call: CallExpression, name: string, file: RegExp): boolean {
  const origin = resolveModuleMemberOrigin(call.getExpression());
  if (origin.kind !== "resolved" || origin.value.canonical.kind !== "project") {
    return false;
  }
  const declaration = origin.value.canonical.declaration;
  return Node.isFunctionDeclaration(declaration) && declaration.getName() === name && file.test(declaration.getSourceFile().getFilePath());
}

/** The `Def` of the `ContributorRegistry<Def>` a call returns. */
function contributionType(call: CallExpression): Type | undefined {
  const def = call.getType().getTypeArguments()[0];
  return def === undefined || def.isAny() ? undefined : def;
}

/** The type's own symbol: an alias when it has one, else the interface or class. */
function ownSymbol(type: Type): TsSymbol | undefined {
  return type.getAliasSymbol() ?? type.getSymbol();
}

function typeLabel(type: Type): string {
  return type.getAliasSymbol()?.getName() ?? type.getSymbol()?.getName() ?? type.getText();
}

/** A contribution type is a door type when it is a door's own declaration or a structural subtype of one. */
function isDoorType(type: Type, doorTypes: readonly Type[]): boolean {
  const symbol = ownSymbol(type);
  return doorTypes.some((door) => (symbol !== undefined && symbol === ownSymbol(door)) || type.isAssignableTo(door));
}

function literalArgument(call: CallExpression, index: number): string | undefined {
  const argument = call.getArguments()[index];
  return argument === undefined ? undefined : readStringValue(argument);
}

/** Sorts one call into the facts the policy judges, by the file it sits in. */
function gatherCall(facts: HarnessFacts, path: string, call: CallExpression): void {
  if (!couldBeRegistryCall(call)) {
    return;
  }
  if (path.startsWith(`${COMPOSE}/`)) {
    if (callsDeclared(call, MINT, MINT_FILE)) {
      facts.doorMints.push(call);
    }
  } else if (path === CT_PROVIDERS) {
    if (call.getExpression().getText() === MINT) {
      facts.registryCalls.push(call);
    }
  } else if (path !== CT_ISOLATION && path !== CT_DOOR && (path.startsWith("tests/client/") || path.startsWith("tests/support/"))) {
    if (callsDeclared(call, MINT, MINT_FILE)) {
      facts.storyMints.push(call);
    } else if (callsDeclared(call, ISOLATE, ISOLATE_FILE)) {
      facts.isolations.push(call);
    }
  }
}

/** The `widgets` property of the harness's real chrome assembly. */
function isChromeWidgets(node: MorphNode): node is PropertyAssignment {
  return (
    Node.isPropertyAssignment(node) &&
    node.getName() === "widgets" &&
    node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() === CHROME_REGISTRY
  );
}

/** A registry of a door contribution type is the door export or a named isolation subset, whatever its name. */
function checkStories(facts: HarnessFacts, report: Report): void {
  const doorTypes = facts.doorMints.flatMap((call) => contributionType(call) ?? []);
  if (doorTypes.length === 0) {
    throw new Error("the production door files mint no registry the checker can type, so no story mint can be judged");
  }
  for (const call of facts.storyMints) {
    const def = contributionType(call);
    if (def !== undefined && isDoorType(def, doorTypes)) {
      report(
        call,
        `a registry of the door contribution type "${typeLabel(def)}" is minted by hand (${literalArgument(call, 0) ?? "unnamed"}); take it from ${CT_DOOR} or declare the subset with ${ISOLATE}(name, isolates, members).`,
      );
    }
  }
  for (const call of facts.isolations) {
    const def = contributionType(call);
    const isolates = literalArgument(call, 1);
    if (def === undefined || !isDoorType(def, doorTypes)) {
      report(call, `${ISOLATE} wraps a registry that is not of a door contribution type; mint it with ${MINT}.`);
    } else if (isolates === undefined || isolates.trim().split(/\s+/u).length < MIN_ISOLATES_WORDS) {
      report(
        call,
        `${ISOLATE} for "${typeLabel(def)}" has no \`isolates\` text: state in an authored string of ${MIN_ISOLATES_WORDS}+ words what the story keeps apart from the production roster.`,
      );
    }
  }
}

/** The harness consumes the mirror: no door registry is minted by hand, and the real chrome assembly takes the door's widget list. */
function checkHarness(required: Required, facts: HarnessFacts, doorRegistryNames: ReadonlySet<string>, report: Report): void {
  for (const call of facts.registryCalls) {
    const first = call.getArguments()[0];
    if (first !== undefined && Node.isStringLiteral(first) && doorRegistryNames.has(first.getLiteralText())) {
      report(call, `${CT_PROVIDERS} mints the "${first.getLiteralText()}" door registry by hand.`);
    }
  }
  const widgets = facts.chromeWidgets;
  const value = widgets?.getInitializer();
  const doorWidgets = variable(required(DOOR_CONTRIBUTORS), "chromeWidgets");
  if (value === undefined || !Node.isIdentifier(value) || findCanonicalVariable(value) !== doorWidgets) {
    report(widgets ?? required(CT_PROVIDERS), `${CHROME_REGISTRY} must assemble \`widgets: chromeWidgets\`, the production list.`);
  }
}

export const gate = defineGate({
  id: "ct-config-mirror-parity",
  family: "ct-config-mirror-parity",
  authority: "hard",
  severity: "error",
  population: { in: ["@client", "@tests"], under: [`${COMPOSE}/**`, ...JUDGED_TREES], notNamed: UNIT_TEST_NAMES },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const files = new Map<string, SourceFile>();
    const harness: HarnessFacts = { registryCalls: [], chromeWidgets: undefined, doorMints: [], storyMints: [], isolations: [] };
    return {
      visitFile: (source) => files.set(ctx.relativePath(source), source),
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression, SyntaxKind.PropertyAssignment],
          visit: (node, source) => {
            const path = ctx.relativePath(source);
            if (Node.isCallExpression(node)) {
              gatherCall(harness, path, node);
            } else if (path === CT_PROVIDERS && isChromeWidgets(node)) {
              harness.chromeWidgets = node;
            }
          },
        },
      ],
      evaluate: () => {
        const required: Required = (path) => {
          const source = files.get(path);
          if (source === undefined) {
            throw new Error(`required CT door mirror source is absent: ${path}`);
          }
          return source;
        };
        const report: Report = (node, detail) => ctx.report.node(node, { message: `${MESSAGE} ${detail}`, fix: FIX });
        const doorRegistryNames = checkFamilies(required, report);
        checkGroups(required, report);
        checkHarness(required, harness, doorRegistryNames, report);
        checkStories(harness, report);
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ configSections: "sectionB, sectionA" }) }),
      expect: { count: 1, token: "configSections", messageIncludes: "order differs at position 1" },
      why: "two swapped sections have the same multiset: only the order check sees them (a CT once rendered attachments first)",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ configSections: "sectionA" }) }),
      expect: { count: 1, token: "configSections", messageIncludes: "section-b" },
      why: "a missing CT section is the founding drift class: the production door has one more address than the mirror",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ configSections: "sectionA, sectionB, sectionA" }) }),
      expect: { count: 1, token: "configSections", messageIncludes: "door 1, CT 2" },
      why: "multiset equality catches a duplicate even though set equality would erase it",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_DOOR]:
          ctDoor({ configSections: "ctSectionA" }) +
          'const ctNavA = { id: "nav-a" };\nconst ctSectionA = { id: "section-a", anchor: "workloads", nav: ctNavA };\n',
        [DOOR_SECTIONS]: `${SECTION_A}${SECTIONS_CALL("sectionA")}`,
      }),
      expect: { count: 1, token: "configSections", messageIncludes: "workloads/nav-a" },
      why: "the address uses the contribution's anchor plus nav.id; matching contribution ids do not hide a wrong anchor",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ toolRenderers: "memberA" }) }),
      expect: { count: 1, token: "toolRenderers", messageIncludes: "memberB (door 1, CT 0)" },
      why: "a CT tool-renderer list that omits a production renderer (the dice renderer) is the drift this gate was extended for",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ chatSurfaceContributors: "memberB, memberA" }) }),
      expect: { count: 1, token: "chatSurfaceContributors", messageIncludes: "order differs at position 1: door has memberA, CT has memberB" },
      why: "surface order is render order in the room; a swapped hand list has equal membership",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ chromeWidgets: "memberA" }) }),
      expect: { count: 2, messageIncludes: "memberB (door 1, CT 0)" },
      why: "a CT chrome list missing a production widget renders a topbar the product does not ship, and the harness that assembles it no longer takes the production list",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ homeTiles: "tileA" }) }),
      expect: { count: 1, token: "homeTiles", messageIncludes: "tileB (door 1, CT 0)" },
      why: "home tiles are a mirrored family: a shorter CT tile list shows a grid the product does not ship",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ slashCommands: "memberB" }), [DOOR_CONTRIBUTORS]: contributorsDoor({ slashCommands: "memberA, memberB" }) }),
      expect: { count: 1, token: "slashCommands", messageIncludes: "memberA (door 1, CT 0)" },
      why: "slash commands are a mirrored family",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ commandPaletteSources: "memberB, memberA" }) }),
      expect: { count: 1, token: "commandPaletteSources", messageIncludes: "order differs" },
      why: "palette sources are a mirrored family, and their order is the order of the palette's groups",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: 'export { toolRenderers } from "../../../packages/client/src/compose/contributors.ts";\n' }),
      expect: { count: 9, messageIncludes: "does not export" },
      why: "a CT door that stops exporting a production family is flagged once per missing family (eight here) and once for the harness widgets, never silently skipped",
    },
    {
      mode: "types",
      files: proofFiles({ [DOOR_GROUPS]: GROUP_DOOR_TWO }),
      expect: { count: 1, token: "REAL_CONFIG_GROUPS", messageIncludes: "b=>groupB (door 1, CT 0)" },
      why: "ct-config-groups is governed by the same two-sided mirror contract, through the production group door",
    },
    {
      mode: "types",
      files: proofFiles({
        [DOOR_GROUPS]: GROUP_DOOR_TWO,
        [CT_GROUPS]: "const groupA = {};\nconst groupB = {};\nconst REAL_CONFIG_GROUPS = { b: groupB, a: groupA };\n",
      }),
      expect: { count: 1, token: "REAL_CONFIG_GROUPS", messageIncludes: "order differs at position 1" },
      why: "the group object's property order is the order the host renders groups in",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_PROVIDERS]: `${PROVIDERS_CLEAN}const hand = createContributorRegistry("tool-renderers", []);\n` }),
      expect: { count: 1, messageIncludes: 'mints the "tool-renderers" door registry by hand' },
      why: "the harness may not rebuild a door registry (the empty tool-renderer registry the chat stories used to mount)",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_PROVIDERS]: `${PROVIDERS_CLEAN}const hand = createContributorRegistry("chat-settings-sections", []);\n` }),
      expect: { count: 1, messageIncludes: 'mints the "chat-settings-sections" door registry by hand' },
      why: "the harness may not rebuild the This chat section registry empty: every shell CT then renders the tab without the production sections",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ chatSettingsSections: "memberB" }) }),
      expect: { count: 1, token: "chatSettingsSections", messageIncludes: "memberA (door 1, CT 0)" },
      why: "chat settings sections are a mirrored family: a hand list that drops a production section is drift",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]: 'const realChromeRegistry = createContributorRegistry("chrome", assembleChrome({ sections, modals, widgets: [bell, wand] }));\n',
      }),
      expect: { count: 1, messageIncludes: "must assemble `widgets: chromeWidgets`" },
      why: "the real chrome assembly takes the door's widget list, never a hand array that drops the plugin and bug-report widgets",
    },
    {
      mode: "types",
      files: storyFiles(`${MINT_IMPORT}export const tiles = createContributorRegistry<TileContribution>("home-tiles", []);\n`),
      expect: { count: 1, messageIncludes: 'door contribution type "TileContribution" is minted by hand' },
      why: "a story that re-lists a production door registry mounts a roster the product does not ship; it takes the door export or names an isolation subset",
    },
    {
      mode: "types",
      files: storyFiles(`${MINT_IMPORT}export const slot = createContributorRegistry<SectionContribution>("host-truth", []);\n`),
      expect: { count: 1, messageIncludes: 'door contribution type "SectionContribution" is minted by hand' },
      why: "a registry is a door registry by its contribution type: a fresh name string fills the same slot the door's registry fills",
    },
    {
      mode: "types",
      files: storyFiles(`${MINT_IMPORT}export const slot = createContributorRegistry("anything", [{ id: "t", title: "T" }]);\n`),
      expect: { count: 1, messageIncludes: 'door contribution type "' },
      why: "an inferred element type that fits a door contribution type is a door registry without ever naming the type",
    },
    {
      mode: "types",
      files: storyFiles(
        `import { createContributorRegistry as mint } from "${FROM_PROBE}packages/client/src/lib/registry.ts";\nimport type { TileContribution } from "${FROM_PROBE}packages/client/src/lib/contribution-types.ts";\nexport const slot = mint<TileContribution>("x", []);\n`,
      ),
      expect: { count: 1, messageIncludes: "is minted by hand" },
      why: "an aliased import binds the same factory: renaming the mint must not hide it",
    },
    {
      mode: "types",
      files: storyFiles(`${MINT_IMPORT}const mint = createContributorRegistry;\nexport const slot = mint<TileContribution>("x", []);\n`),
      expect: { count: 1, messageIncludes: "is minted by hand" },
      why: "a local alias of the factory resolves to the same declaration",
    },
    {
      mode: "types",
      files: storyFiles(
        `import * as lib from "${FROM_PROBE}packages/client/src/lib/registry.ts";\nimport type { TileContribution } from "${FROM_PROBE}packages/client/src/lib/contribution-types.ts";\nexport const slot = lib.createContributorRegistry<TileContribution>("x", []);\n`,
      ),
      expect: { count: 1, messageIncludes: "is minted by hand" },
      why: "a namespace member call reaches the same factory without an import specifier to subscribe to",
    },
    {
      mode: "types",
      files: storyFiles(
        `import * as lib from "${FROM_PROBE}packages/client/src/lib/registry.ts";\nimport type { TileContribution } from "${FROM_PROBE}packages/client/src/lib/contribution-types.ts";\nexport const slot = lib["createContributorRegistry"]<TileContribution>("x", []);\n`,
      ),
      expect: { count: 1, messageIncludes: "is minted by hand" },
      why: "the bracket spelling of a namespace member call reaches the same factory: an element-access callee is a member read too",
    },
    {
      mode: "types",
      files: storyFiles('import { slot } from "./registries.ts";\nexport const t = slot;\n', STORY_PATH, {
        "tests/client/features/probe/registries.ts": `${MINT_IMPORT}export const slot = createContributorRegistry<TileContribution>("x", []);\n`,
      }),
      expect: { count: 1, messageIncludes: "is minted by hand" },
      why: "a mint in a `.ts` helper a story imports is reached by the story",
    },
    {
      mode: "types",
      files: storyFiles('import { slot } from "../../../support/browser/probe-registries.ts";\nexport const t = slot;\n', STORY_PATH, {
        "tests/support/browser/probe-registries.ts": `${importsFor("../../../")}export const slot = createContributorRegistry<TileContribution>("x", []);\n`,
      }),
      expect: { count: 1, messageIncludes: "is minted by hand" },
      why: "a mint in a browser support helper is reached by every story that imports it",
    },
    {
      mode: "types",
      files: storyFiles(`${MINT_IMPORT}export const slot = createContributorRegistry<TileContribution>("x", []);\n`, "tests/client/features/probe/stories.tsx"),
      expect: { count: 1, messageIncludes: "is minted by hand" },
      why: "a story module is any module under the client tests, not only the underscore-prefixed or fixtures names",
    },
    {
      mode: "types",
      files: storyFiles(`${MINT_IMPORT}export const slot = createContributorRegistry<TileContribution>("x", []);\n`, "tests/client/features/probe/_support.ts"),
      expect: { count: 1, messageIncludes: "is minted by hand" },
      why: "an underscore-prefixed `.ts` support module is reached by stories like any other",
    },
    {
      mode: "types",
      files: storyFiles(
        `${MINT_IMPORT}export const slot = createContributorRegistry<TileContribution>("x", []);\n`,
        "tests/client/features/probe/probe.ct.tsx",
      ),
      expect: { count: 1, messageIncludes: "is minted by hand" },
      why: "a CT spec mounts what it mints, so it takes the door export or names an isolation subset as a story does",
    },
    {
      mode: "types",
      files: storyFiles(`${ISOLATION_IMPORT}export const tiles = isolationRegistry<TileContribution>("home-tiles", "tile", []);\n`),
      expect: { count: 1, messageIncludes: "has no `isolates` text" },
      why: "an isolation exception without a reason that names what is isolated is an unexplained hand list",
    },
    {
      mode: "types",
      files: storyFiles(`${ISOLATION_IMPORT}const WHY = "${ISOLATES}";\nexport const tiles = isolationRegistry<TileContribution>("home-tiles", WHY, []);\n`),
      expect: { count: 1, messageIncludes: "has no `isolates` text" },
      why: "the reason is read from the authored call, so a constant the reader cannot see is refused",
    },
    {
      mode: "types",
      files: storyFiles(`${ISOLATION_IMPORT}export const own = isolationRegistry<PlainEntry>("story-only", "${ISOLATES}", []);\n`),
      expect: { count: 1, messageIncludes: "not of a door contribution type" },
      why: "an isolation exception exists only for a registry of a door contribution type; any other registry is minted plainly",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: proofFiles(),
      why: "a CT door that re-exports every production declaration, with a harness that consumes it, is clean",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_DOOR]: ctDoor({ toolRenderers: "memberA, memberB" }),
      }),
      why: "a hand list identical to the production list in membership and order is clean",
    },
    {
      mode: "types",
      files: storyFiles(`${ISOLATION_IMPORT}export const tiles = isolationRegistry<TileContribution>("home-tiles", "${ISOLATES}", []);\n`),
      why: "a named isolation subset with a reason that says what it isolates is the sanctioned exception",
    },
    {
      mode: "types",
      files: storyFiles(
        `import { isolationRegistry as isolate } from "../../../support/browser/ct-isolation.ts";\nimport type { TileContribution } from "${FROM_PROBE}packages/client/src/lib/contribution-types.ts";\nexport const tiles = isolate<TileContribution>("home-tiles", "${ISOLATES}", []);\n`,
      ),
      why: "an aliased isolation import is the same named exception",
    },
    {
      mode: "types",
      files: storyFiles(`${MINT_IMPORT}export const own = createContributorRegistry<PlainEntry>("story-only", []);\n`),
      why: "a registry whose contribution type no door registry takes is the story's own",
    },
    {
      mode: "types",
      files: storyFiles(
        `${MINT_IMPORT}export const tiles = createContributorRegistry<TileContribution>("home-tiles", []);\n`,
        "tests/client/features/probe/registry.test.ts",
      ),
      why: "a unit test is not mounted by a CT or story, so the factory's own duplicate-id throw can be asserted on a hand-made roster",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ chatSettingsSections: "memberA, memberB" }) }),
      why: "a chat settings section list identical to the production list in membership and order is clean",
    },
  ],
});
