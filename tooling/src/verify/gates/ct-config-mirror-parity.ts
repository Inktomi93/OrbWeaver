// Policy: ct-config-mirror-parity — the browser-CT config composition mirrors the production door.
// The section comparison is the multiset `(anchor, nav.id, contribution id)`: `nav.id` is the second
// argument to `configAnchorId`, while the contribution's own `id` is a different identity. The group
// comparison is the multiset `(group key, canonical group export)`. This is a singleton because the two
// mirrors are one CT composition contract and share no meaningful reader with another policy.
import type { Node as MorphNode, ObjectLiteralExpression, SourceFile, VariableDeclaration } from "ts-morph";
import { Node } from "ts-morph";
import { resolveModuleMemberOrigin, resolveStableExpression } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { definitionField, definitionStringField } from "../lib/registry-definition-field.ts";
import { resolveAuthoredComposite } from "../lib/static-authored-value.ts";

const PRODUCTION_SECTIONS = "packages/client/src/compose/config-sections.ts";
const CT_SECTIONS = "tests/support/browser/ct-data-providers.tsx";
const PRODUCTION_GROUPS = "packages/client/src/compose/authed-app.tsx";
const CT_GROUPS = "tests/support/browser/ct-config-groups.ts";

const MESSAGE =
  "the browser-CT config composition has drifted from the production door: config sections must have the same " +
  "(anchor, nav.id, contribution id) multiset and config groups must have the same (group key, canonical export) multiset. " +
  "The four files are packages/client/src/compose/config-sections.ts ↔ tests/support/browser/ct-data-providers.tsx and " +
  "packages/client/src/compose/authed-app.tsx ↔ tests/support/browser/ct-config-groups.ts.";
const FIX =
  "mirror the production config-section and config-group assemblies exactly; derive a section anchor from `anchor` plus `nav.id`, never from the contribution id.";

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

function canonicalVariable(node: MorphNode, label: string): VariableDeclaration {
  const origin = resolveModuleMemberOrigin(node);
  const stable = origin.kind === "unresolved" ? resolveStableExpression(node) : undefined;
  const declaration =
    origin.kind === "resolved" && origin.value.canonical.kind === "project"
      ? origin.value.canonical.declaration
      : stable?.trace.declarations.findLast(Node.isVariableDeclaration);
  if (declaration === undefined || !Node.isVariableDeclaration(declaration)) {
    throw new Error(`${label} does not resolve to one exported variable`);
  }
  return declaration;
}

const GROUP_DOOR = 'const groupA = {};\nconst configGroups = createRegistry("config-groups", IDS, { a: groupA });\n';
const GROUP_CT = "const groupA = {};\nconst REAL_CONFIG_GROUPS = { a: groupA };\n";
const SECTION_A = 'const navA = { id: "nav-a" };\nconst sectionA = { id: "section-a", anchor: "admin", nav: navA };\n';
const SECTION_B = 'const navB = { id: "nav-b" };\nconst sectionB = { id: "section-b", anchor: "admin", nav: navB };\n';
const CLEAN_SECTION_DOOR = `${SECTION_A}const configSections = createContributorRegistry("config-sections", [sectionA]);\n`;
const CLEAN_SECTION_CT = `${SECTION_A}const realSettingsSections = createContributorRegistry("config-sections", [sectionA]);\n`;

function proofFiles(productionSections: string, ctSections: string, productionGroups = GROUP_DOOR, ctGroups = GROUP_CT): Readonly<Record<string, string>> {
  return {
    [PRODUCTION_SECTIONS]: productionSections,
    [CT_SECTIONS]: ctSections,
    [PRODUCTION_GROUPS]: productionGroups,
    [CT_GROUPS]: ctGroups,
  };
}

function authoredString(object: ObjectLiteralExpression, field: string, label: string): string {
  const value = definitionStringField(object, field);
  if (value === undefined || value.kind === "unresolved") {
    throw new Error(`${label}.${field} is not an authored string`);
  }
  return value.value;
}

function sectionRows(source: SourceFile, registryName: string): readonly string[] {
  const declaration = variable(source, registryName);
  const initializer = declaration.getInitializer();
  if (initializer === undefined || !Node.isCallExpression(initializer)) {
    throw new Error(`${source.getBaseName()}:${registryName} is not a registry call`);
  }
  const members = initializer.getArguments()[1];
  if (members === undefined || !Node.isArrayLiteralExpression(members)) {
    throw new Error(`${source.getBaseName()}:${registryName} has no authored member array`);
  }
  return members.getElements().map((member) => {
    const contribution = canonicalVariable(member, member.getText());
    const contributionObject = objectValue(contribution.getInitializer(), contribution.getName());
    const anchor = authoredString(contributionObject, "anchor", contribution.getName());
    const sectionId = authoredString(contributionObject, "id", contribution.getName());
    const nav = objectValue(definitionField(contributionObject, "nav"), `${contribution.getName()}.nav`);
    const subId = authoredString(nav, "id", `${contribution.getName()}.nav`);
    return `${anchor}/${subId}=>${sectionId}`;
  });
}

function groupRows(source: SourceFile, registryName: string): readonly string[] {
  const declaration = variable(source, registryName);
  const initializer = declaration.getInitializer();
  const object =
    initializer !== undefined && Node.isCallExpression(initializer)
      ? objectValue(initializer.getArguments()[2], `${source.getBaseName()}:${registryName}`)
      : objectValue(initializer, `${source.getBaseName()}:${registryName}`);
  return object.getProperties().map((property) => {
    if (!Node.isPropertyAssignment(property)) {
      throw new Error(`${source.getBaseName()}:${registryName} contains a non-property group row`);
    }
    const value = property.getInitializer();
    if (value === undefined) {
      throw new Error(`${property.getName()} has no group value`);
    }
    const contribution = canonicalVariable(value, property.getName());
    return `${property.getName()}=>${contribution.getName()}`;
  });
}

function multiset(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function differences(left: readonly string[], right: readonly string[]): readonly string[] {
  const expected = multiset(left);
  const actual = multiset(right);
  return [...new Set([...expected.keys(), ...actual.keys()])]
    .toSorted()
    .flatMap((key) => ((expected.get(key) ?? 0) === (actual.get(key) ?? 0) ? [] : [`${key} (door ${expected.get(key) ?? 0}, CT ${actual.get(key) ?? 0})`]));
}

export const gate = defineGate({
  id: "ct-config-mirror-parity",
  family: "ct-config-mirror-parity",
  authority: "hard",
  severity: "error",
  population: { in: ["@client", "@tests"], under: [PRODUCTION_SECTIONS, CT_SECTIONS, PRODUCTION_GROUPS, CT_GROUPS] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const files = new Map<string, SourceFile>();
    return {
      visitFile: (source) => files.set(ctx.relativePath(source), source),
      evaluate: () => {
        const required = (path: string): SourceFile => {
          const source = files.get(path);
          if (source === undefined) {
            throw new Error(`required config mirror source is absent: ${path}`);
          }
          return source;
        };
        const sectionDiff = differences(
          sectionRows(required(PRODUCTION_SECTIONS), "configSections"),
          sectionRows(required(CT_SECTIONS), "realSettingsSections"),
        );
        if (sectionDiff.length > 0) {
          const anchor = variable(required(CT_SECTIONS), "realSettingsSections");
          ctx.report.node(anchor, {
            message: `${MESSAGE} Section differences: ${sectionDiff.join("; ")}. The mirror to repair is tests/support/browser/ct-data-providers.tsx.`,
            fix: FIX,
          });
        }
        const groupDiff = differences(groupRows(required(PRODUCTION_GROUPS), "configGroups"), groupRows(required(CT_GROUPS), "REAL_CONFIG_GROUPS"));
        if (groupDiff.length > 0) {
          const anchor = variable(required(CT_GROUPS), "REAL_CONFIG_GROUPS");
          ctx.report.node(anchor, {
            message: `${MESSAGE} Group differences: ${groupDiff.join("; ")}. The mirror to repair is tests/support/browser/ct-config-groups.ts.`,
            fix: FIX,
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: proofFiles(
        `${SECTION_A}${SECTION_B}const configSections = createContributorRegistry("config-sections", [sectionA, sectionB]);\n`,
        CLEAN_SECTION_CT,
      ),
      expect: { count: 1, token: "realSettingsSections", messageIncludes: "section-b" },
      why: "a missing CT section is the founding drift class: the production door has one more address than the mirror",
    },
    {
      mode: "types",
      files: proofFiles(
        CLEAN_SECTION_DOOR,
        `${SECTION_A}${SECTION_B}const realSettingsSections = createContributorRegistry("config-sections", [sectionA, sectionB]);\n`,
      ),
      expect: { count: 1, token: "realSettingsSections", messageIncludes: "section-b" },
      why: "the reverse difference is policed too: an extra CT-only section cannot make equality pass in one direction",
    },
    {
      mode: "types",
      files: proofFiles(CLEAN_SECTION_DOOR, `${SECTION_A}const realSettingsSections = createContributorRegistry("config-sections", [sectionA, sectionA]);\n`),
      expect: { count: 1, token: "realSettingsSections", messageIncludes: "door 1, CT 2" },
      why: "multiset equality catches a duplicate even though set equality would erase it",
    },
    {
      mode: "types",
      files: proofFiles(
        CLEAN_SECTION_DOOR,
        'const ctNavA = { id: "nav-a" };\nconst ctSectionA = { id: "section-a", anchor: "workloads", nav: ctNavA };\nconst realSettingsSections = createContributorRegistry("config-sections", [ctSectionA]);\n',
      ),
      expect: { count: 1, token: "realSettingsSections", messageIncludes: "workloads/nav-a" },
      why: "the address uses the contribution's anchor plus nav.id; matching contribution ids do not hide a wrong anchor",
    },
    {
      mode: "types",
      files: proofFiles(CLEAN_SECTION_DOOR, CLEAN_SECTION_CT, GROUP_DOOR, "const REAL_CONFIG_GROUPS = {};\n"),
      expect: { count: 1, token: "REAL_CONFIG_GROUPS", messageIncludes: "a=>groupA" },
      why: "ct-config-groups is governed by the same two-sided mirror contract, through the production group door",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: proofFiles(CLEAN_SECTION_DOOR, CLEAN_SECTION_CT),
      why: "identical section-address and group-entry multisets are clean",
    },
  ],
});
