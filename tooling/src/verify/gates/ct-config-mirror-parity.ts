// CT mounts use canonical production composition or named isolation; copied lists fail even when their rows match.
// Factory and component identity use shared reference readers; native mount signatures and visitor-fed views own entry admission.
// A singleton: registry forwarding, assembly and mounting are one CT composition contract; legacy suites remain outside strict admission.
import type { CallExpression, Node as MorphNode, ObjectLiteralExpression, SourceFile, Symbol as TsSymbol, Type, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin, resolveStableExpression } from "../../floor/code-facts/reference-fact.ts";
import { resolveCallableDeclaration } from "../../floor/code-facts/reference-fact-call.ts";
import { BROWSER_PACKAGES, worldOf } from "../../floor/compiler/project-worlds.ts";
import { defineGate } from "../contract/policy.ts";
import { readStringValue } from "../lib/ast-read.ts";
import { ctMountArguments, MIN_ISOLATION_REASON_WORDS, readCtMountAdmission, readCtProductionDoor } from "../lib/ct-mount-admission.ts";
import { definitionField, definitionStringField } from "../lib/registry-definition-field.ts";
import { resolveAuthoredComposite } from "../lib/static-authored-value.ts";

const COMPOSE = "packages/client/src/compose";
const DOOR_SECTIONS = `${COMPOSE}/config-sections.ts`;
const DOOR_TILES = `${COMPOSE}/home-tiles.ts`;
const DOOR_CONTRIBUTORS = `${COMPOSE}/contributors.ts`;
const DOOR_GROUPS = `${COMPOSE}/authed-composition.tsx`;
const DOOR_PROVIDERS = `${COMPOSE}/authed-providers.tsx`;
const DOOR_RUNTIME = `${COMPOSE}/client-runtime.ts`;
const CT_RUNTIME = "tests/support/browser/ct-runtime.ts";
const CT_DOOR = "tests/support/browser/ct-door.ts";
const CT_GROUPS = "tests/support/browser/ct-config-groups.ts";
const CT_PROVIDERS = "tests/support/browser/ct-data-providers.tsx";
const CT_ISOLATION = "tests/support/browser/ct-isolation.ts";
/** Every module a CT or story reaches is judged for hand-minted door registries: the whole client test tree and
 *  the test support tree, except unit tests (which never mount a registry in a browser). */
const JUDGED_TREES = ["tests/**"] as const;
const UNIT_TEST_NAMES = ["*.test.ts", "*.test.tsx", "*.test-d.ts"] as const;
/** The factory and the exception are recognised by DECLARATION, never by import spelling or local name. */
const MINT = "createContributorRegistry";
const CLOSED_MINT = "createRegistry";
const MINT_FILE = /(?:^|\/)lib\/registry\.ts$/u;
const ISOLATE = "isolationRegistry";
const ISOLATE_FILE = /(?:^|\/)ct-isolation\.ts$/u;

const MESSAGE =
  "CTs must reuse production factories, registry declarations and providers; an equal copied assembly is still drift. Maintained browser-package CTs enter through CtClientProviders or a named CtIsolation. Registry subsets use isolationRegistry with the actual registry name and an authored reason.";
const FIX = `Forward declarations through ${CT_DOOR}; mount CtClientProviders from ${CT_PROVIDERS}, or state a genuine isolated subject through ${CT_ISOLATION}. Derive registry variants through isolationRegistry instead of copying lists.`;

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

const GROUP_DOOR =
  'import { createRegistry } from "../lib/registry.ts";\nconst IDS = ["a"] as const;\nexport const groupA = { id: "a", shelf: "user", label: "A", body: { sections: true } };\nexport const configGroups = createRegistry("config-groups", IDS, { a: groupA });\nexport function createAuthedComposition(channel: object) { return channel; }\n';
const GROUP_CT = `export { configGroups as realConfigGroups } from "../../../${DOOR_GROUPS}";\n`;
const GROUP_DOOR_TWO =
  'import { createRegistry } from "../lib/registry.ts";\nconst IDS = ["a", "b"] as const;\nexport const groupA = { id: "a", shelf: "user", label: "A", body: { sections: true } };\nexport const groupB = { id: "b", shelf: "user", label: "B", body: { sections: true } };\nexport const configGroups = createRegistry("config-groups", IDS, { a: groupA, b: groupB });\nexport function createAuthedComposition(channel: object) { return channel; }\n';
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
  return `${SECTION_A}${SECTION_B}${reexport(["configSections"], DOOR_SECTIONS)}${reexport(["homeTiles"], DOOR_TILES)}${reexport(CONTRIBUTOR_NAMES, DOOR_CONTRIBUTORS)}${hand}export { createAuthedComposition } from "../../../${DOOR_GROUPS}";\nexport { AuthedProviders } from "../../../${DOOR_PROVIDERS}";\nexport { createClientRuntime } from "../../../${DOOR_RUNTIME}";\n`;
}

const PROVIDERS_CLEAN =
  'import { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\n' +
  "const composition = createAuthedComposition({});\nexport function CtClientProviders({ children }: { children?: object }) { return <AuthedProviders composition={composition}>{children}</AuthedProviders>; }\n";
const RUNTIME_CLEAN = 'import { createClientRuntime } from "./ct-door.ts";\nconst runtime = createClientRuntime();\n';

const LIB_REGISTRY = "packages/client/src/lib/registry.ts";
const LIB_TYPES = "packages/client/src/lib/contribution-types.ts";
/** The factory, three contribution types (two are door types) and the exception, declared where the real ones are. */
const VIRTUAL_LIB: Readonly<Record<string, string>> = {
  [LIB_REGISTRY]:
    "export interface ContributorRegistry<Def extends { readonly id: string }> {\n  readonly name: string;\n  readonly list: () => readonly Def[];\n}\n" +
    "export declare function createRegistry<Id extends string, Def>(name: string, ids: readonly Id[], definitions: Record<Id, Def>): Registry<Id, Def>;\n" +
    "export interface Registry<Id extends string, Def> { readonly name: string; readonly get: (id: Id) => Def; readonly list: () => readonly Def[]; readonly has: (id: Id) => boolean; }\n" +
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
    [CT_RUNTIME]: RUNTIME_CLEAN,
    [DOOR_RUNTIME]: "export function createClientRuntime() { return {}; }\n",
    [DOOR_PROVIDERS]: "export function AuthedProviders(props: object) { return null; }\n",
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

const MOUNT_PATH = "tests/client/features/probe/probe.ct.tsx";
const ISOLATED_SUBJECT = "tests/support/browser/ct-isolated-subject.tsx";
const FEATURE_SURFACE = "packages/client/src/features/probe/index.tsx";
const MOUNT_TYPES = "node_modules/@playwright/experimental-ct-react/index.d.ts";

function mountFiles(source: string, more: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return proofFiles({
    [MOUNT_TYPES]:
      "export interface MountOptions<HooksConfig> { hooksConfig?: HooksConfig; }\nexport interface MountResult { unmount: () => Promise<void>; update: (component: object) => Promise<void>; }\nexport interface ComponentFixtures { mount: <HooksConfig>(component: object, options?: MountOptions<HooksConfig>) => Promise<MountResult>; }\nexport declare const test: (name: string, body: (fixtures: ComponentFixtures) => void) => void;\n",
    [ISOLATED_SUBJECT]: "export function CtIsolation(props: { subject: string; isolates: string; children?: object }) { return null; }\n",
    [FEATURE_SURFACE]: "export function FeatureSurface() { return <div />; }\n",
    [MOUNT_PATH]: `import { test } from "@playwright/experimental-ct-react";\nimport { FeatureSurface } from "../../../../${FEATURE_SURFACE}";\n${source}`,
    ...more,
  });
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
    } else if (!sameDeclaration(mirror, door)) {
      const diff = differences(family.rows(door), family.rows(mirror));
      report(
        mirror,
        diff.length > 0
          ? `${family.label} differences: ${diff.join("; ")}.`
          : `${family.label} must forward the canonical production declaration, not copy its rows.`,
      );
    }
  }
  return doorRegistryNames;
}

function sameDeclaration(left: MorphNode, right: MorphNode): boolean {
  return left.getSourceFile().getFilePath() === right.getSourceFile().getFilePath() && left.getStart() === right.getStart() && left.getEnd() === right.getEnd();
}

function checkGroups(required: Required, report: Report): void {
  const source = required(CT_GROUPS);
  const mirror = source.getExportedDeclarations().get("realConfigGroups")?.find(Node.isVariableDeclaration);
  const door = variable(required(DOOR_GROUPS), "configGroups");
  if (mirror !== undefined && sameDeclaration(mirror, door)) {
    return;
  }
  const copied = source.getVariableDeclaration("REAL_CONFIG_GROUPS");
  const diff = copied === undefined ? [] : differences(groupRows(door), groupRows(copied));
  report(
    copied ?? source,
    diff.length > 0
      ? `config group differences: ${diff.join("; ")}.`
      : "config groups must forward the canonical production registry, not copy its group table.",
  );
}

/** What the files the policy judges declare, gathered by the visitor (no gate-owned walk). */
interface HarnessFacts {
  /** Registry mints in the production door files: their element types are the door contribution types. */
  readonly doorMints: CallExpression[];
  /** Registry mints anywhere else in the judged trees. */
  readonly storyMints: CallExpression[];
  /** `isolationRegistry` calls in the judged trees: the named isolation exceptions. */
  readonly isolations: CallExpression[];
  readonly compositionCalls: CallExpression[];
  readonly providerTags: MorphNode[];
  readonly mounts: { readonly call: CallExpression; readonly args: readonly MorphNode[] }[];
  readonly returns: Map<object, MorphNode[]>;
  readonly children: Map<object, MorphNode[]>;
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
  const def = call.getType().getTypeArguments().at(-1);
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
function gatherMount(facts: HarnessFacts, path: string, call: CallExpression): void {
  if (path === CT_PROVIDERS || path === CT_RUNTIME) {
    facts.compositionCalls.push(call);
  }
  if ([...BROWSER_PACKAGES].some((name) => path.startsWith(`tests/${name}/`)) && path.endsWith(".ct.tsx")) {
    const args = ctMountArguments(call);
    if (args !== undefined) {
      facts.mounts.push({ call, args });
    }
  }
}

const CLOSED_REGISTRY_ARITY = 3;
const REGISTRY_CALL_ARITIES: ReadonlySet<number> = new Set([2, CLOSED_REGISTRY_ARITY]);

function gatherCall(facts: HarnessFacts, path: string, call: CallExpression): void {
  gatherMount(facts, path, call);
  if (!REGISTRY_CALL_ARITIES.has(call.getArguments().length)) {
    return;
  }
  const mint = callsDeclared(call, MINT, MINT_FILE) || callsDeclared(call, CLOSED_MINT, MINT_FILE);
  if (path.startsWith(`${COMPOSE}/`)) {
    if (mint) {
      facts.doorMints.push(call);
    }
  } else if (path !== CT_ISOLATION && path !== CT_DOOR && path.startsWith("tests/")) {
    if (mint) {
      facts.storyMints.push(call);
    } else if (callsDeclared(call, ISOLATE, ISOLATE_FILE)) {
      facts.isolations.push(call);
    }
  }
}

/** A registry of a door contribution type is the door export or a named isolation subset, whatever its name. */
function checkStories(facts: HarnessFacts, report: Report): void {
  const doorTypes = facts.doorMints.flatMap((call) => contributionType(call) ?? []);
  const names = new Set(facts.doorMints.flatMap((call) => literalArgument(call, 0) ?? []));
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
  checkIsolations(facts.isolations, doorTypes, names, report);
}

function checkIsolations(isolations: readonly CallExpression[], doorTypes: readonly Type[], names: ReadonlySet<string>, report: Report): void {
  for (const call of isolations) {
    const def = contributionType(call);
    const isolates = literalArgument(call, 1);
    const name = literalArgument(call, 0);
    if (def === undefined || !isDoorType(def, doorTypes)) {
      report(call, `${ISOLATE} wraps a registry that is not of a door contribution type; mint it with ${MINT}.`);
    } else if (name === undefined || !names.has(name)) {
      report(call, `${ISOLATE} must name the production registry whose contributions it keeps apart.`);
    } else if (isolates === undefined || isolates.trim().split(/\s+/u).length < MIN_ISOLATION_REASON_WORDS) {
      report(
        call,
        `${ISOLATE} for "${typeLabel(def)}" has no \`isolates\` text: state in an authored string of ${MIN_ISOLATION_REASON_WORDS}+ words what the story keeps apart from the production roster.`,
      );
    }
  }
}

/** Genuine factories and providers prevent a parallel graph; maintained mounts enter through that door or named isolation. */
function productionWitness(required: Required, facts: HarnessFacts, report: Report): MorphNode | undefined {
  let missingWitness = false;
  for (const [home, name] of [
    [DOOR_GROUPS, "createAuthedComposition"],
    [DOOR_RUNTIME, "createClientRuntime"],
  ] as const) {
    const target = required(home).getFunctionOrThrow(name);
    if (
      !facts.compositionCalls.some((call) => {
        const resolved = resolveCallableDeclaration(call);
        return resolved.kind === "resolved" && sameDeclaration(resolved.value.declaration, target);
      })
    ) {
      missingWitness = true;
      report(required(CT_PROVIDERS), `the CT mount must call the production ${name} factory instead of assembling a parallel graph.`);
    }
  }
  const provider = required(DOOR_PROVIDERS).getFunctionOrThrow("AuthedProviders");
  if (
    !facts.providerTags.some((tag) => {
      const resolved = resolveCallableDeclaration(tag);
      return resolved.kind === "resolved" && sameDeclaration(resolved.value.declaration, provider);
    })
  ) {
    missingWitness = true;
    report(required(CT_PROVIDERS), "the CT mount must use the actual AuthedProviders stack, not repeat its provider list.");
  }
  if (missingWitness) {
    return;
  }
  return provider;
}

function checkHarness(required: Required, facts: HarnessFacts, _doorRegistryNames: ReadonlySet<string>, report: Report): void {
  const provider = productionWitness(required, facts, report);
  if (provider === undefined) {
    return;
  }
  const door = required(CT_PROVIDERS).getFunction("CtClientProviders");
  const problems =
    door === undefined
      ? ["the returned CtClientProviders declaration is absent"]
      : readCtProductionDoor({ door, factory: required(DOOR_GROUPS).getFunctionOrThrow("createAuthedComposition"), provider }, facts.returns, facts.children);
  if (problems.length > 0 || door === undefined) {
    for (const problem of problems) {
      report(door ?? required(CT_PROVIDERS), problem);
    }
    return;
  }
  for (const { call, args } of facts.mounts) {
    const mountProblems =
      args.length === 0
        ? ["an indirect or empty native mount exposes no readable subject"]
        : args.flatMap((arg) => readCtMountAdmission(arg, facts.returns, facts.children, door));
    for (const problem of mountProblems) {
      report(call, problem);
    }
  }
}

function gatherReturns(facts: HarnessFacts, node: MorphNode): void {
  if (Node.isFunctionLikeDeclaration(node)) {
    facts.returns.set(node.compilerNode, []);
  }
  if (Node.isReturnStatement(node)) {
    const owner = node.getFirstAncestor(Node.isFunctionLikeDeclaration);
    const expression = node.getExpression();
    if (owner !== undefined && expression !== undefined) {
      const rows = facts.returns.get(owner.compilerNode) ?? [];
      rows.push(expression);
      facts.returns.set(owner.compilerNode, rows);
    }
  } else if (Node.isArrowFunction(node) && !Node.isBlock(node.getBody())) {
    facts.returns.set(node.compilerNode, [node.getBody()]);
  }
}

function gatherView(facts: HarnessFacts, node: MorphNode, path: string): void {
  if (worldOf(path) !== "browser") {
    return;
  }
  gatherReturns(facts, node);
  if ((Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) && path === CT_PROVIDERS) {
    facts.providerTags.push(node.getTagNameNode());
  }
  if (!(Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node) || Node.isJsxFragment(node) || Node.isJsxExpression(node))) {
    return;
  }
  const parent = node.getFirstAncestor(
    (ancestor) =>
      Node.isJsxElement(ancestor) ||
      Node.isJsxFragment(ancestor) ||
      Node.isJsxExpression(ancestor) ||
      Node.isJsxAttribute(ancestor) ||
      Node.isJsxSpreadAttribute(ancestor) ||
      Node.isFunctionLikeDeclaration(ancestor),
  );
  if (parent !== undefined && (Node.isJsxElement(parent) || Node.isJsxFragment(parent))) {
    const rows = facts.children.get(parent.compilerNode) ?? [];
    rows.push(node);
    facts.children.set(parent.compilerNode, rows);
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
    const harness: HarnessFacts = {
      doorMints: [],
      storyMints: [],
      isolations: [],
      compositionCalls: [],
      providerTags: [],
      mounts: [],
      returns: new Map(),
      children: new Map(),
    };
    return {
      visitFile: (source) => files.set(ctx.relativePath(source), source),
      visitors: [
        {
          kinds: [
            SyntaxKind.CallExpression,
            SyntaxKind.FunctionDeclaration,
            SyntaxKind.FunctionExpression,
            SyntaxKind.MethodDeclaration,
            SyntaxKind.ReturnStatement,
            SyntaxKind.ArrowFunction,
            SyntaxKind.JsxElement,
            SyntaxKind.JsxOpeningElement,
            SyntaxKind.JsxSelfClosingElement,
            SyntaxKind.JsxFragment,
            SyntaxKind.JsxExpression,
          ],
          visit: (node, source) => {
            const path = ctx.relativePath(source);
            gatherView(harness, node, path);
            if (Node.isCallExpression(node)) {
              gatherCall(harness, path, node);
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
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\nexport function CtClientProviders({ children }: { children?: object }) { const graph = createAuthedComposition({}); return <><AuthedProviders composition={graph}>{children}</AuthedProviders>{true && children}</>; }\n',
      }),
      expect: { count: 1, messageIncludes: "returned" },
      why: "an unproved conditional child beside a genuine provider cannot disappear from the mounting proof",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\nexport function CtClientProviders({ children }: { children?: object }) { const graph = createAuthedComposition({}); return <AuthedProviders composition={graph}><AuthedProviders composition={{}}>{children}</AuthedProviders></AuthedProviders>; }\n',
      }),
      expect: { count: 1, messageIncludes: "composition" },
      why: "a valid outer provider cannot erase the invalid composition delivered by its nested provider",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\nfunction Recursive({ children }: { children?: object }) { return <Recursive>{children}</Recursive>; }\nexport function CtClientProviders({ children }: { children?: object }) { const graph = createAuthedComposition({}); return <Recursive><AuthedProviders composition={graph}>{children}</AuthedProviders></Recursive>; }\n',
      }),
      expect: { count: 1, messageIncludes: "returned" },
      why: "a recursive helper cannot supply a delivered provider by repeatedly borrowing the same invocation",
    },
    {
      mode: "types",
      files: mountFiles(
        'import { CtClientProviders } from "../../../support/browser/ct-data-providers.tsx";\ntest("probe", ({ mount }) => { mount(<CtClientProviders><FeatureSurface /></CtClientProviders>); });\n',
        {
          [CT_PROVIDERS]:
            'import { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\nexport function UnusedRealStack() { const composition = createAuthedComposition({}); return <AuthedProviders composition={composition} />; }\nexport function CtClientProviders({ children }: { children?: object }) { return <>{children}</>; }\n',
        },
      ),
      expect: { count: 1, messageIncludes: "returned" },
      why: "unused genuine factories and providers cannot admit a door that returns its children outside that stack",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\nconst unused = createAuthedComposition({});\nexport function CtClientProviders() { return <AuthedProviders composition={{}} />; }\n',
      }),
      expect: { count: 1, messageIncludes: "composition" },
      why: "a reachable genuine provider must receive the production factory result, not an unrelated object",
    },
    {
      mode: "types",
      files: mountFiles('test("probe", ({ mount }) => { mount(<FeatureSurface />); });\n'),
      expect: { count: 1, messageIncludes: "outside the production door" },
      why: "a bare client component mounts a tree without the actual authenticated provider door",
    },
    {
      mode: "types",
      files: mountFiles('function CtClientProviders() { return <FeatureSurface />; }\ntest("probe", ({ mount }) => { mount(<CtClientProviders />); });\n'),
      expect: { count: 1, messageIncludes: "outside the production door" },
      why: "a same-named local wrapper is not the canonical client mount door",
    },
    {
      mode: "types",
      files: mountFiles(
        'import { CtIsolation } from "../../../support/browser/ct-isolated-subject.tsx";\ntest("probe", ({ mount }) => { mount(<CtIsolation subject="FeatureSurface" isolates="feature"><FeatureSurface /></CtIsolation>); });\n',
      ),
      expect: { count: 1, messageIncludes: "requires an authored subject" },
      why: "an isolation that does not say what it keeps apart is not an admitted mounting boundary",
    },
    {
      mode: "types",
      files: mountFiles(
        'import { CtIsolation } from "../../../support/browser/ct-isolated-subject.tsx";\ntest("probe", ({ mount }) => { mount(<div><CtIsolation subject="Control" isolates="keeps the control apart"><span /></CtIsolation><FeatureSurface /></div>); });\n',
      ),
      expect: { count: 1, messageIncludes: "outside the production door" },
      why: "an isolated sibling cannot grant admission to a bare client component beside it",
    },
    {
      mode: "types",
      files: mountFiles(
        'import { CtClientProviders } from "../../../support/browser/ct-data-providers.tsx";\nfunction Story({ good }: { good: boolean }) { return good ? <CtClientProviders /> : <FeatureSurface />; }\ntest("probe", ({ mount }) => { mount(<Story good={true} />); });\n',
      ),
      expect: { count: 1, messageIncludes: "outside the production door" },
      why: "all authored component return branches are judged rather than taking the first valid branch",
    },
    {
      mode: "types",
      files: mountFiles(
        'import { CtClientProviders } from "../../../support/browser/ct-data-providers.tsx";\ntest("probe", ({ mount }) => { mount.call(null, <CtClientProviders />); });\n',
      ),
      expect: { count: 1, messageIncludes: "indirect or empty native mount" },
      why: "an unsupported Function wrapper remains a refusal instead of hiding the native mount",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { AuthedProviders } from "./ct-door.ts";\nfunction createAuthedComposition() { return {}; }\nexport function CtClientProviders() { return <AuthedProviders composition={createAuthedComposition()} />; }\n',
      }),
      expect: { count: 1, messageIncludes: "production createAuthedComposition factory" },
      why: "a local factory with the production name cannot replace genuine graph construction",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { createAuthedComposition } from "./ct-door.ts";\nconst composition = createAuthedComposition({});\nexport function CtClientProviders() { return <div />; }\n',
      }),
      expect: { count: 1, messageIncludes: "actual AuthedProviders stack" },
      why: "a genuine factory call does not excuse replacing the actual provider stack",
    },
    {
      mode: "types",
      files: proofFiles({ [CT_DOOR]: ctDoor({ chatSettingsSections: "memberA, memberB" }) }),
      expect: { count: 1, messageIncludes: "canonical production declaration" },
      why: "an equal copied chat-settings list is still a second assembly",
    },

    {
      mode: "types",
      files: proofFiles({
        [CT_DOOR]: ctDoor({ toolRenderers: "memberA, memberB" }),
      }),
      expect: { count: 1, messageIncludes: "canonical production declaration" },
      why: "even an equal hand list is a copied assembly rather than the production door",
    },

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
      expect: { count: 1, messageIncludes: "memberB (door 1, CT 0)" },
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
      files: proofFiles({
        [CT_DOOR]: `export { toolRenderers } from "../../../${DOOR_CONTRIBUTORS}";\nexport { createAuthedComposition } from "../../../${DOOR_GROUPS}";\nexport { AuthedProviders } from "../../../${DOOR_PROVIDERS}";\nexport { createClientRuntime } from "../../../${DOOR_RUNTIME}";\n`,
      }),
      expect: { count: 8, messageIncludes: "does not export" },
      why: "missing family exports are reported while the genuine factory and provider imports remain intact",
    },
    {
      mode: "types",
      files: proofFiles({ [DOOR_GROUPS]: GROUP_DOOR_TWO, [CT_GROUPS]: "const groupA = {};\nconst REAL_CONFIG_GROUPS = { a: groupA };\n" }),
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
      files: proofFiles({
        [CT_PROVIDERS]: `${PROVIDERS_CLEAN}${importsFor("../../../")}const hand = createContributorRegistry<SectionContribution>("tool-renderers", []);\n`,
      }),
      expect: { count: 1, messageIncludes: "is minted by hand" },
      why: "the harness may not rebuild a door registry (the empty tool-renderer registry the chat stories used to mount)",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]: `${PROVIDERS_CLEAN}${importsFor("../../../")}const hand = createContributorRegistry<SectionContribution>("chat-settings-sections", []);\n`,
      }),
      expect: { count: 1, messageIncludes: "is minted by hand" },
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
        [CT_PROVIDERS]: `${importsFor("../../../")}const realChromeRegistry = createContributorRegistry<SectionContribution>("chrome", []);\n`,
      }),
      expect: { count: 3, messageIncludes: "createAuthedComposition factory" },
      why: "a hand-minted chrome registry cannot replace the production composition factory and provider stack",
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
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\nfunction Delegated({ graph, children }: { graph: object; children?: object }) { return <AuthedProviders composition={graph} children={children} />; }\nexport function CtClientProviders({ children }: { children?: object }) { const graph = createAuthedComposition({}); return <Delegated graph={graph} children={children} />; }\n',
      }),
      why: "explicit children props retain their delegated flow while other prop values are not misclassified as rendered children",
    },
    {
      mode: "types",
      files: proofFiles({
        "node_modules/@ct-native/sibling/index.tsx": "export function NativeSibling() { return <span />; }\n",
        [CT_PROVIDERS]:
          'import { NativeSibling } from "@ct-native/sibling";\nimport { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\ndeclare function UnknownSibling(): object;\nexport function CtClientProviders({ children }: { children?: object }) { const graph = createAuthedComposition({}); return <><AuthedProviders composition={graph}>{children}</AuthedProviders>{"status"}{7}{null}{false}<UnknownSibling /><NativeSibling /></>; }\n',
      }),
      why: "genuine neutral literals and opaque native siblings do not imply a child escape or invalidate the real provider",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\nexport function CtClientProviders({ children }: { children?: object }) { const graph = createAuthedComposition({}); return <AuthedProviders composition={graph}><AuthedProviders composition={graph}>{children}</AuthedProviders></AuthedProviders>; }\n',
      }),
      why: "valid nested providers preserve the child delivery and composition proof",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\nfunction Frame({ children }: { children?: object }) { return <div>{children}</div>; }\nfunction Delegated({ graph, children }: { graph: object; children?: object }) { return <Frame><AuthedProviders composition={graph}>{children}</AuthedProviders></Frame>; }\nexport function CtClientProviders({ children }: { children?: object }) { const graph = createAuthedComposition({}); return <Frame><Delegated graph={graph}>{children}</Delegated></Frame>; }\n',
      }),
      why: "the same real wrapper at distinct nested call sites is not a recursive returned tree and must preserve the delivered provider",
    },
    {
      mode: "types",
      files: proofFiles({
        "node_modules/@ct-native/container/index.tsx": "export function NativeContainer({ children }: { children?: object }) { return <>{children}</>; }\n",
        [CT_PROVIDERS]:
          'import { NativeContainer } from "@ct-native/container";\nimport { createAuthedComposition, AuthedProviders } from "./ct-door.ts";\nexport function CtClientProviders({ children }: { children?: object }) { const composition = createAuthedComposition({}); return <NativeContainer><AuthedProviders composition={composition}>{children}</AuthedProviders></NativeContainer>; }\n',
      }),
      why: "an external native container has no policy-owned return facts but still contains the delivered production provider; that absence is not an empty authored helper",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { useState as hold, use as read, createContext } from "react";\nimport { createAuthedComposition as build, AuthedProviders as Deliver } from "./ct-door.ts";\nconst CompositionContext = createContext<object | null>(null);\nfunction useComposition() { const inherited = read(CompositionContext); const [composition] = hold(() => inherited ?? build({})); return { composition }; }\nfunction Delegated({ graph, children }: { graph: object; children?: object }) { return <CompositionContext value={graph}><Deliver composition={graph}>{children}</Deliver></CompositionContext>; }\nexport function CtClientProviders({ children }: { children?: object }) { const { composition } = useComposition(); return <Delegated graph={composition}>{children}</Delegated>; }\n',
      }),
      why: "a retained factory result travels through native React state, a returned hook object and delegated props without becoming an unused witness",
    },
    {
      mode: "types",
      files: mountFiles(
        'import { CtClientProviders } from "../../../support/browser/ct-data-providers.tsx";\ntest("probe", ({ mount }) => { mount(<CtClientProviders><FeatureSurface /></CtClientProviders>); });\n',
        {
          [CT_PROVIDERS]:
            'import { createAuthedComposition as build, AuthedProviders as Deliver } from "./ct-door.ts";\nfunction Delegated({ graph, children }: { graph: object; children?: object }) { return <Deliver composition={graph}>{children}</Deliver>; }\nexport function CtClientProviders({ children }: { children?: object }) { const graph = build({}); return <Delegated graph={graph}>{children}</Delegated>; }\n',
        },
      ),
      why: "a returned delegated provider receives the actual production factory result through its prop",
    },
    {
      mode: "types",
      files: mountFiles(
        'import { CtClientProviders as Door } from "../../../support/browser/ct-data-providers.tsx";\nfunction Story() { return <Door><FeatureSurface /></Door>; }\ntest("probe", ({ mount }) => { const mountAlias = mount; mountAlias(<Story />); });\n',
      ),
      why: "native mount aliases and a genuine door imported under another name keep canonical identity",
    },
    {
      mode: "types",
      files: mountFiles(
        'import * as isolation from "../../../support/browser/ct-isolated-subject.tsx";\ntest("probe", ({ mount }) => { mount(<isolation.CtIsolation subject="FeatureSurface" isolates="keeps the component state apart"><FeatureSurface /></isolation.CtIsolation>); });\n',
      ),
      why: "a namespace import reaches the same named isolation without being mistaken for an intrinsic element",
    },
    {
      mode: "types",
      files: proofFiles({
        [CT_PROVIDERS]:
          'import { createAuthedComposition as build, AuthedProviders as Deliver } from "./ct-door.ts";\nconst composition = build({});\nexport function CtClientProviders({ children }: { children?: object }) { return <Deliver composition={composition}>{children}</Deliver>; }\n',
      }),
      why: "factory and provider aliases still use the actual production declarations",
    },
    {
      mode: "types",
      files: proofFiles(),
      why: "a CT door that re-exports every production declaration, with a harness that consumes it, is clean",
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
  ],
});
