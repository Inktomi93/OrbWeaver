// Gate: appearance-carrier-contract (#935) — every Appearance schema leaf has one owner, executable
// carrier declaration, and live consumer that reads the key.
// The manifest deliberately preserves the multi-plane theme engine; this gate rejects carrier flattening.

import type { ArrayLiteralExpression, ObjectLiteralExpression, PropertyAssignment, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { belongsToObjectDeclaration, literalObjectKeys } from "../lib/appearance-carrier-contract-ast.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";

const MANIFEST_FILE = "packages/client/src/lib/appearance-carrier-manifest.ts";
const SCHEMA_FILE = "packages/contracts/src/settings/appearance.ts";
const BOOT_FILE = "packages/client/src/compose/stamp-appearance-boot-hint.ts";
const USE_APPEARANCE_FILE = "packages/client/src/features/app-shell/hooks/use-appearance.ts";
const SNAP_APPEARANCE_FILE = "tooling/src/_shared/appearance.ts";
const MANIFEST_SYMBOL = "APPEARANCE_CARRIER_MANIFEST";
const OWNERS_SYMBOL = "APPEARANCE_OWNER_KEYS";
const OBSERVABLES_SYMBOL = "APPEARANCE_CARRIER_OBSERVABLES";
const PLANTED_MANIFEST_BASENAME = "__g_appearance-carrier-manifest.ts";
const EDITOR_BINDINGS = {
  sizing: ["packages/client/src/features/app-shell/lib/appearance-sizing-model.ts", "APPEARANCE_SIZING_KEYS", ".sizing"],
  effects: ["packages/client/src/features/app-shell/lib/appearance-effects-model.ts", "APPEARANCE_EFFECTS_KEYS", ".effects"],
  background: ["packages/client/src/features/app-shell/lib/appearance-background-model.ts", "APPEARANCE_BACKGROUND_KEYS", ".background"],
  reading: ["packages/client/src/features/app-shell/lib/appearance-reading-model.ts", "APPEARANCE_READING_KEYS", ".reading"],
  avatars: ["packages/client/src/features/chat/lib/appearance-avatars-model.ts", "APPEARANCE_AVATARS_KEYS", ".avatars"],
  "message-style": ["packages/client/src/features/chat/lib/appearance-message-style-model.ts", "APPEARANCE_MESSAGE_STYLE_KEYS", '["message-style"]'],
  "message-details": ["packages/client/src/features/chat/lib/appearance-message-details-model.ts", "APPEARANCE_MESSAGE_DETAILS_KEYS", '["message-details"]'],
} as const;

interface Row {
  readonly key: string;
  readonly owner: string;
  readonly carriers: readonly string[];
  readonly consumerFile: string;
  readonly consumerSymbol: string;
  readonly lifecycle: string;
  readonly portal: string;
  readonly arms: readonly string[] | undefined;
  readonly node: PropertyAssignment;
}

const identifiersByFunction = new Map<string, Set<string>>();
const declaredFunctions = new Set<string>();
const collectedSchemaLeaves = new Set<string>();
const plantedManifestSources = new Map<string, SourceFile>();

function unwrapped(node: Node): Node {
  let current = node;
  while (Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

function initializerObject(sf: SourceFile, symbol: string): ObjectLiteralExpression | undefined {
  const init = sf.getVariableDeclaration(symbol)?.getInitializer();
  const value = init === undefined ? undefined : unwrapped(init);
  return value !== undefined && Node.isObjectLiteralExpression(value) ? value : undefined;
}

function propertyName(property: PropertyAssignment): string {
  return property.getNameNode().getText().replaceAll('"', "").replaceAll("'", "");
}

function objectProperties(sf: SourceFile, object: ObjectLiteralExpression, seen = new Set<string>()): Map<string, Node> {
  const out = new Map<string, Node>();
  for (const member of object.getProperties()) {
    if (Node.isPropertyAssignment(member)) {
      const init = member.getInitializer();
      if (init !== undefined) {
        out.set(propertyName(member), unwrapped(init));
      }
      continue;
    }
    if (!Node.isSpreadAssignment(member)) {
      continue;
    }
    const spreadName = member.getExpression().getText();
    if (seen.has(spreadName)) {
      continue;
    }
    const spread = initializerObject(sf, spreadName);
    if (spread === undefined) {
      continue;
    }
    const nestedSeen = new Set(seen);
    nestedSeen.add(spreadName);
    for (const [key, value] of objectProperties(sf, spread, nestedSeen)) {
      out.set(key, value);
    }
  }
  return out;
}

function stringValue(node: Node | undefined): string | undefined {
  return node !== undefined && (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) ? node.getLiteralText() : undefined;
}

function arrayLiteral(sf: SourceFile, node: Node | undefined): ArrayLiteralExpression | undefined {
  if (node === undefined) {
    return;
  }
  const value = unwrapped(node);
  if (Node.isArrayLiteralExpression(value)) {
    return value;
  }
  if (!Node.isIdentifier(value)) {
    return;
  }
  const initializer = sf.getVariableDeclaration(value.getText())?.getInitializer();
  const resolved = initializer === undefined ? undefined : unwrapped(initializer);
  return resolved !== undefined && Node.isArrayLiteralExpression(resolved) ? resolved : undefined;
}

function stringArray(sf: SourceFile, node: Node | undefined): readonly string[] {
  return (
    arrayLiteral(sf, node)
      ?.getElements()
      .map((item) => stringValue(unwrapped(item)))
      .filter((v): v is string => v !== undefined) ?? []
  );
}

function resolveObject(sf: SourceFile, node: Node | undefined): ObjectLiteralExpression | undefined {
  if (node === undefined) {
    return;
  }
  const value = unwrapped(node);
  if (Node.isObjectLiteralExpression(value)) {
    return value;
  }
  return Node.isIdentifier(value) ? initializerObject(sf, value.getText()) : undefined;
}

function manifestRows(sf: SourceFile): readonly Row[] {
  const manifest = initializerObject(sf, MANIFEST_SYMBOL);
  if (manifest === undefined) {
    throw new Error(`${MANIFEST_SYMBOL} is missing or not an object literal`);
  }
  const rows: Row[] = [];
  for (const member of manifest.getProperties()) {
    if (!Node.isPropertyAssignment(member)) {
      continue;
    }
    const rowObject = resolveObject(sf, member.getInitializer());
    if (rowObject === undefined) {
      throw new Error(`${MANIFEST_SYMBOL}.${propertyName(member)} is not an object literal`);
    }
    const props = objectProperties(sf, rowObject);
    const consumer = resolveObject(sf, props.get("consumer"));
    const consumerProps = consumer === undefined ? new Map<string, Node>() : objectProperties(sf, consumer);
    const armsNode = props.get("requiredDistinctArms");
    rows.push({
      key: propertyName(member),
      owner: stringValue(props.get("owner")) ?? "",
      carriers: stringArray(sf, props.get("carriers")),
      consumerFile: stringValue(consumerProps.get("file")) ?? "",
      consumerSymbol: stringValue(consumerProps.get("symbol")) ?? "",
      lifecycle: stringValue(props.get("lifecycle")) ?? "",
      portal: stringValue(props.get("portal")) ?? "",
      arms: arrayLiteral(sf, armsNode)
        ?.getElements()
        .map((arm) => arm.getText()),
      node: member,
    });
  }
  return rows;
}

function ownerKeys(sf: SourceFile): ReadonlyMap<string, readonly string[]> {
  const owners = initializerObject(sf, OWNERS_SYMBOL);
  if (owners === undefined) {
    throw new Error(`${OWNERS_SYMBOL} is missing or not an object literal`);
  }
  const out = new Map<string, readonly string[]>();
  for (const member of owners.getProperties()) {
    if (Node.isPropertyAssignment(member)) {
      out.set(propertyName(member), stringArray(sf, member.getInitializer()));
    }
  }
  return out;
}

function finding(message: string, token?: string): Finding {
  return { file: MANIFEST_FILE, line: 1, column: 0, message, ...(token === undefined ? {} : { token }) };
}

function reportSetDiff(ctx: GateRunCtx, label: string, expected: ReadonlySet<string>, actual: ReadonlySet<string>): void {
  for (const key of expected) {
    if (!actual.has(key)) {
      ctx.report(finding(`${label}: missing ${key}`, key));
    }
  }
  for (const key of actual) {
    if (!expected.has(key)) {
      ctx.report(finding(`${label}: stale/unknown ${key}`, key));
    }
  }
}

function validateEditorBindings(ctx: GateRunCtx): void {
  for (const [owner, [file, symbol, suffix]] of Object.entries(EDITOR_BINDINGS)) {
    if (!fileLoaded(ctx, file)) {
      continue;
    }
    const declaration = ctx.project.getSourceFile(`${ctx.root}/${file}`)?.getVariableDeclaration(symbol);
    const text = declaration?.getInitializer()?.getText() ?? "";
    if (!(text.includes(OWNERS_SYMBOL) && text.endsWith(suffix))) {
      ctx.report(finding(`editor tuple ${symbol} is not bound to ${OWNERS_SYMBOL}.${owner}`, symbol));
    }
  }
}

const PORTAL_BY_CARRIER: Readonly<Record<string, string>> = {
  "root-html": "must-reach-portals",
  "theme-scope": "shared-theme-scope-sibling",
  "shell-grid": "grid-only",
  "background-layer": "outside-theme-scope",
  "message-props": "prop-threaded",
  "source-catalog": "none",
};

function validateRowSemantics(ctx: GateRunCtx, row: Row): void {
  if (row.carriers.length === 0) {
    ctx.report(row.node, { token: row.key, offset: row.node.getText().indexOf(row.key) });
  }
  if (row.arms !== undefined && (row.arms.length !== 2 || row.arms[0] === row.arms[1])) {
    ctx.report(finding(`required-distinct arms for ${row.key} are equal or malformed`, row.key));
  }
  const carrier = row.carriers[0];
  if (carrier === undefined || PORTAL_BY_CARRIER[carrier] !== row.portal) {
    ctx.report(finding(`wrong carrier/portal obligation for ${row.key}: ${carrier ?? "none"} + ${row.portal === "" ? "none" : row.portal}`, row.key));
  }
  const liveKey = `${row.consumerFile}#${row.consumerSymbol}`;
  if (!declaredFunctions.has(liveKey)) {
    ctx.report(finding(`live consumer ${liveKey} for ${row.key} does not exist`, row.key));
  } else if (identifiersByFunction.get(liveKey)?.has(row.key) !== true) {
    ctx.report(finding(`live consumer ${liveKey} does not bind ${row.key}`, row.key));
  }
}

function validateRows(ctx: GateRunCtx, rows: readonly Row[], owners: ReadonlyMap<string, readonly string[]>): ReadonlyMap<string, number> {
  const planeCounts = new Map<string, number>();
  for (const row of rows) {
    if (owners.get(row.owner)?.includes(row.key) !== true) {
      ctx.report(finding(`wrong owner for ${row.key}: manifest=${row.owner || "missing"}`, row.key));
    }
    for (const plane of row.carriers) {
      planeCounts.set(plane, (planeCounts.get(plane) ?? 0) + 1);
    }
    validateRowSemantics(ctx, row);
  }
  return planeCounts;
}

function validatePlanePopulations(ctx: GateRunCtx, planeCounts: ReadonlyMap<string, number>): void {
  if (!fileLoaded(ctx, BOOT_FILE)) {
    return;
  }
  for (const plane of ["root-html", "theme-scope", "shell-grid", "background-layer", "message-props", "source-catalog"]) {
    if ((planeCounts.get(plane) ?? 0) === 0) {
      ctx.report(finding(`carrier plane ${plane} reached zero appearance keys`, plane));
    }
  }
}

function validateSnapProjection(ctx: GateRunCtx, rows: readonly Row[], prepaint: readonly string[]): void {
  if (!fileLoaded(ctx, SNAP_APPEARANCE_FILE)) {
    return;
  }
  const snapIds = identifiersByFunction.get(`${SNAP_APPEARANCE_FILE}#appearanceBootHintPatch`) ?? new Set<string>();
  const expectedSnap = new Set([...prepaint, "density"]);
  for (const key of expectedSnap) {
    if (!snapIds.has(key)) {
      ctx.report(finding(`Snap boot-hint projection is missing ${key}`, key));
    }
  }
  for (const row of rows) {
    if (!(expectedSnap.has(row.key) || !snapIds.has(row.key))) {
      ctx.report(finding(`Snap boot-hint projection wrongly includes hydrated-only ${row.key}`, row.key));
    }
  }
}

function validateLifecycle(ctx: GateRunCtx, rows: readonly Row[]): void {
  if (!(fileLoaded(ctx, BOOT_FILE) && fileLoaded(ctx, USE_APPEARANCE_FILE))) {
    return;
  }
  const prepaint = rows
    .filter((row) => row.lifecycle === "prepaint-and-hydrated")
    .map((row) => row.key)
    .sort();
  if (prepaint.join(",") !== "fontScale,reducedMotion") {
    ctx.report(finding(`prepaint subset drifted: ${prepaint.join(",") || "zero"}`));
  }
  const density = rows.find((row) => row.key === "density");
  if (density?.lifecycle !== "hydrated-from-prepaint-hint") {
    ctx.report(finding("density must remain React-only but seeded from the prepaint hint", "density"));
  }
  const stampIds = identifiersByFunction.get(`${BOOT_FILE}#stampAppearanceBootHint`) ?? new Set<string>();
  const pendingIds = identifiersByFunction.get(`${USE_APPEARANCE_FILE}#useAppearance`) ?? new Set<string>();
  for (const key of prepaint) {
    if (!(stampIds.has(key) && pendingIds.has(key))) {
      ctx.report(finding(`prepaint/hydrated parity is missing ${key}`, key));
    }
  }
  if (stampIds.has("density") || !pendingIds.has("density")) {
    ctx.report(finding("density was faked onto prepaint or dropped from the pending React carrier", "density"));
  }
  validateSnapProjection(ctx, rows, prepaint);
}

function reconcile(ctx: GateRunCtx): void {
  if (!(fileLoaded(ctx, MANIFEST_FILE) && fileLoaded(ctx, SCHEMA_FILE))) {
    return;
  }
  const manifestSource = ctx.project.getSourceFile(`${ctx.root}/${MANIFEST_FILE}`);
  if (manifestSource === undefined || ctx.project.getSourceFile(`${ctx.root}/${SCHEMA_FILE}`) === undefined) {
    throw new Error("appearance carrier contract anchors were loaded but unavailable in the shared project");
  }
  const rows = manifestRows(manifestSource);
  const schema = new Set(collectedSchemaLeaves);
  if (schema.size === 0) {
    throw new Error("appearanceSettingsSchema resolved to zero leaves in the shared walk");
  }
  const owners = ownerKeys(manifestSource);
  ctx.scan({ unit: "appearance keys", candidates: schema.size, scanned: rows.length });
  reportSetDiff(ctx, "schema↔manifest", schema, new Set(rows.map((row) => row.key)));
  reportSetDiff(ctx, "schema↔editor owners", schema, new Set([...owners.values()].flat()));
  reportSetDiff(
    ctx,
    "armed↔observable",
    new Set(rows.filter((row) => row.arms !== undefined).map((row) => row.key)),
    literalObjectKeys(manifestSource, OBSERVABLES_SYMBOL),
  );
  const allEditorBindingsLoaded = Object.values(EDITOR_BINDINGS).every(([file]) => fileLoaded(ctx, file));
  if (allEditorBindingsLoaded) {
    if (owners.size !== Object.keys(EDITOR_BINDINGS).length) {
      ctx.report(finding(`editor owner population is ${owners.size}, expected ${Object.keys(EDITOR_BINDINGS).length}`));
    }
    validateEditorBindings(ctx);
  }
  validatePlanePopulations(ctx, validateRows(ctx, rows, owners));
  validateLifecycle(ctx, rows);
  for (const source of plantedManifestSources.values()) {
    for (const row of manifestRows(source)) {
      validateRowSemantics(ctx, row);
    }
  }
}

export const gate: GateDescriptor = {
  name: "appearance-carrier-contract",
  docRow: "Core-Enforcement-Active-Gates.md (client-architecture-lockdown.md §4; #935)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "Appearance carrier graph drift: schema, editor owner, carrier, live consumer, or first-frame parity no longer agrees with the canonical 41-key manifest (client-architecture-lockdown.md §4).",
  fix: `repair ${MANIFEST_FILE} and the named live binding together; do not flatten the theme/custom-CSS planes`,
  scanRoot: (path) => path.startsWith("packages/client/src/") || path === SCHEMA_FILE || path === SNAP_APPEARANCE_FILE,
  kinds: [SyntaxKind.FunctionDeclaration, SyntaxKind.Identifier, SyntaxKind.PropertyAssignment],
  begin: () => {
    identifiersByFunction.clear();
    declaredFunctions.clear();
    collectedSchemaLeaves.clear();
    plantedManifestSources.clear();
  },
  visit: (node, sf, ctx) => {
    const file = repoRel(ctx.root, sf.getFilePath());
    if (file.endsWith(`/${PLANTED_MANIFEST_BASENAME}`) && belongsToObjectDeclaration(node, MANIFEST_SYMBOL)) {
      plantedManifestSources.set(file, sf);
    }
    if (Node.isPropertyAssignment(node) && file === SCHEMA_FILE) {
      const object = node.getParent();
      const call = object.getParent();
      const expression = Node.isCallExpression(call) ? call.getExpression() : undefined;
      const declaration = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
      if (
        Node.isObjectLiteralExpression(object) &&
        Node.isPropertyAccessExpression(expression) &&
        expression.getName() === "object" &&
        declaration?.getName() === "appearanceSettingsSchema"
      ) {
        collectedSchemaLeaves.add(propertyName(node));
      }
      return;
    }
    if (Node.isFunctionDeclaration(node)) {
      const name = node.getName();
      if (name !== undefined) {
        declaredFunctions.add(`${file}#${name}`);
      }
      return;
    }
    if (!Node.isIdentifier(node)) {
      return;
    }
    const fn = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
    const name = fn?.getName();
    if (name === undefined) {
      return;
    }
    const key = `${file}#${name}`;
    const ids = identifiersByFunction.get(key) ?? new Set<string>();
    ids.add(node.getText());
    identifiersByFunction.set(key, ids);
  },
  finalize: reconcile,
  mustFlag: [
    {
      files: {
        [SCHEMA_FILE]: 'import { z } from "zod"; export const appearanceSettingsSchema = z.object({ ghost: z.boolean() });',
        [MANIFEST_FILE]: "export const APPEARANCE_OWNER_KEYS = { sizing: [] }; export const APPEARANCE_CARRIER_MANIFEST = {};",
      },
      expect: { messageIncludes: "schema↔manifest: missing ghost" },
      why: "missing-carrier control: a new schema leaf cannot exist outside the manifest",
    },
    {
      files: {
        [SCHEMA_FILE]: 'import { z } from "zod"; export const appearanceSettingsSchema = z.object({ density: z.string() });',
        [MANIFEST_FILE]:
          'const C={file:"packages/client/src/x.ts",symbol:"AppShell"}; export const APPEARANCE_OWNER_KEYS={sizing:["density"]}; export const APPEARANCE_CARRIER_MANIFEST={density:{owner:"effects",carriers:["theme-scope"],consumer:C,lifecycle:"hydrated-from-prepaint-hint",portal:"shared-theme-scope-sibling",requiredDistinctArms:["compact","comfortable"]}}; export const APPEARANCE_CARRIER_OBSERVABLES={density:{kind:"attribute",selector:"x",signal:"data-density"}};',
        "packages/client/src/x.ts": "export function AppShell(){ const density = 1; return density; }",
      },
      expect: { messageIncludes: "wrong owner for density" },
      why: "wrong-owner control: a valid key assigned to the wrong editor group is red",
    },
    {
      files: {
        [SCHEMA_FILE]: 'import { z } from "zod"; export const appearanceSettingsSchema = z.object({ density: z.string() });',
        [MANIFEST_FILE]:
          'const C={file:"packages/client/src/x.ts",symbol:"AppShell"}; export const APPEARANCE_OWNER_KEYS={sizing:["density"]}; export const APPEARANCE_CARRIER_MANIFEST={density:{owner:"sizing",carriers:["theme-scope"],consumer:C,lifecycle:"hydrated-from-prepaint-hint",portal:"grid-only",requiredDistinctArms:["compact","compact"]}}; export const APPEARANCE_CARRIER_OBSERVABLES={density:{kind:"attribute",selector:"x",signal:"data-density"}};',
        "packages/client/src/x.ts": "export function AppShell(){ const other = 1; return other; }",
      },
      expect: { count: 3 },
      why: "equal-arm + wrong-carrier + live-binding controls all bite the same composed bad row",
    },
  ],
  mustPass: [
    {
      files: {
        [SCHEMA_FILE]: 'import { z } from "zod"; export const appearanceSettingsSchema = z.object({ width: z.number() });',
        [MANIFEST_FILE]:
          'const C={file:"packages/client/src/x.ts",symbol:"AppShell"}; export const APPEARANCE_OWNER_KEYS={sizing:["width"]}; export const APPEARANCE_CARRIER_MANIFEST={width:{owner:"sizing",carriers:["shell-grid"],consumer:C,lifecycle:"hydrated",portal:"grid-only",requiredDistinctArms:[60,90]}}; export const APPEARANCE_CARRIER_OBSERVABLES={width:{kind:"inline-style",selector:"x",signal:"--width"}};',
        "packages/client/src/x.ts": "export function AppShell(){ const width = 90; return width; }",
      },
      why: "one schema leaf, its owner, a legal carrier/portal pair, distinct arms, and a live named consumer all agree",
    },
  ],
};
