// Policy: ct-config-mirror-parity — the browser-CT door mirrors the production door, membership AND order.
// Families: config sections, home tiles, chat surfaces, tool renderers, slash commands, palette sources,
// corpus context tabs and chrome widgets (each read from `ct-door.ts` against its `compose/` list) plus the
// config groups. A CT export that IS the production declaration passes; a hand list must match row for row.
// A singleton: the mirrors are one CT composition contract and share no meaningful reader with another policy.
import type { CallExpression, Node as MorphNode, ObjectLiteralExpression, PropertyAssignment, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin, resolveStableExpression } from "../../floor/code-facts/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
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
const CHROME_REGISTRY = "realChromeRegistry";

const MESSAGE =
  "the browser-CT door has drifted from the production door: every registry the CT mounts must be the production " +
  "declaration or list the same rows in the same order (config sections by (anchor, nav.id, contribution id), config " +
  "groups by (group key, canonical export), every other list by its member expression). " +
  `The mirrors are ${CT_DOOR} and ${CT_GROUPS}; the harness ${CT_PROVIDERS} must consume them, never re-list a door registry.`;
const FIX = `re-export the production declaration from ${CT_DOOR} instead of listing it; a derived section address is \`anchor\` plus \`nav.id\`, never the contribution id.`;

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
const SECTIONS_CALL = (members: string): string => `export const configSections = createContributorRegistry("config-sections", [${members}]);\n`;
const TILES_DOOR = 'export const homeTiles = createContributorRegistry("home-tiles", [tileA, tileB]);\n';

const CONTRIBUTOR_NAMES = ["chatSurfaceContributors", "toolRenderers", "slashCommands", "commandPaletteSources", "corpusContextTabs", "chromeWidgets"] as const;
type ContributorName = (typeof CONTRIBUTOR_NAMES)[number];

/** Registry-call families that live in `contributors.ts`, with the registry name each one is minted under. */
const CONTRIBUTOR_REGISTRIES: Readonly<Record<Exclude<ContributorName, "chromeWidgets">, string>> = {
  chatSurfaceContributors: "chat-surface",
  toolRenderers: "tool-renderers",
  slashCommands: "slash-commands",
  commandPaletteSources: "command-palette-sources",
  corpusContextTabs: "corpus-context",
};

function contributorsDoor(members: Partial<Record<ContributorName, string>> = {}): string {
  return CONTRIBUTOR_NAMES.map((name) => {
    const list = members[name] ?? "memberA, memberB";
    return name === "chromeWidgets"
      ? `export const chromeWidgets = [${list}];\n`
      : `export const ${name} = createContributorRegistry("${CONTRIBUTOR_REGISTRIES[name]}", [${list}]);\n`;
  }).join("");
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

function proofFiles(overrides: Partial<Readonly<Record<string, string>>> = {}): Readonly<Record<string, string>> {
  return {
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

/** What the harness file declares that the policy judges, gathered by the visitor (no gate-owned walk). */
interface HarnessFacts {
  readonly registryCalls: CallExpression[];
  chromeWidgets: PropertyAssignment | undefined;
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
  population: { in: ["@client", "@tests"], under: [DOOR_SECTIONS, DOOR_TILES, DOOR_CONTRIBUTORS, DOOR_GROUPS, CT_DOOR, CT_GROUPS, CT_PROVIDERS] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const files = new Map<string, SourceFile>();
    const harness: HarnessFacts = { registryCalls: [], chromeWidgets: undefined };
    return {
      visitFile: (source) => files.set(ctx.relativePath(source), source),
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression, SyntaxKind.PropertyAssignment],
          visit: (node, source) => {
            if (ctx.relativePath(source) !== CT_PROVIDERS) {
              return;
            }
            if (Node.isCallExpression(node) && node.getExpression().getText() === "createContributorRegistry") {
              harness.registryCalls.push(node);
            } else if (
              Node.isPropertyAssignment(node) &&
              node.getName() === "widgets" &&
              node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() === CHROME_REGISTRY
            ) {
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
      expect: { count: 8, messageIncludes: "does not export" },
      why: "a CT door that stops exporting a production family is flagged once per missing family (seven here) and once for the harness widgets, never silently skipped",
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
      files: proofFiles({
        [CT_PROVIDERS]: 'const realChromeRegistry = createContributorRegistry("chrome", assembleChrome({ sections, modals, widgets: [bell, wand] }));\n',
      }),
      expect: { count: 1, messageIncludes: "must assemble `widgets: chromeWidgets`" },
      why: "the real chrome assembly takes the door's widget list, never a hand array that drops the plugin and bug-report widgets",
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
  ],
});
