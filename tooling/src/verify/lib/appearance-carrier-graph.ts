// Pure appearance graph reconciliation over dispatcher-collected source evidence.
// Health failures and exact empty-carrier occurrences remain distinct authority classes.
import type { ArrayLiteralExpression, ObjectLiteralExpression, PropertyAssignment, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { literalObjectKeys } from "./appearance-carrier-contract-ast.ts";
export const SCHEMA_FILE = "packages/contracts/src/settings/appearance.ts";
export const SNAP_APPEARANCE_FILE = "tooling/src/_shared/appearance.ts";
export const MANIFEST_SYMBOL = "APPEARANCE_CARRIER_MANIFEST";
export interface AppearanceCarrierEvidence {
  readonly identifiersByFunction: ReadonlyMap<string, ReadonlySet<string>>;
  readonly declaredFunctions: ReadonlySet<string>;
  readonly collectedSchemaLeaves: ReadonlySet<string>;
  readonly plantedManifestSources: ReadonlyMap<string, SourceFile>;
}
interface HealthFinding {
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly token?: string;
}
interface CarrierOccurrence {
  readonly node: PropertyAssignment;
  readonly token: string;
  readonly offset: number;
}
interface GraphRead {
  readonly sources: ReadonlyMap<string, SourceFile>;
  readonly evidence: AppearanceCarrierEvidence;
  readonly health: HealthFinding[];
  readonly occurrences: CarrierOccurrence[];
  keys: number;
}
export const MANIFEST_FILE = "packages/client/src/lib/appearance-carrier-manifest.ts";
const BOOT_FILE = "packages/client/src/compose/stamp-appearance-boot-hint.ts";
const USE_APPEARANCE_FILE = "packages/client/src/features/app-shell/hooks/use-appearance.ts";
const OWNERS_SYMBOL = "APPEARANCE_OWNER_KEYS";
const OBSERVABLES_SYMBOL = "APPEARANCE_CARRIER_OBSERVABLES";
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

function sourceAt(ctx: GraphRead, path: string): SourceFile | undefined {
  return ctx.sources.get(path);
}
function fileLoaded(ctx: GraphRead, path: string): boolean {
  return sourceAt(ctx, path) !== undefined;
}
function finding(message: string, token?: string): HealthFinding {
  return { line: 1, column: 1, message, ...(token === undefined ? {} : { token }) };
}

function reportSetDiff(ctx: GraphRead, label: string, expected: ReadonlySet<string>, actual: ReadonlySet<string>): void {
  for (const key of expected) {
    if (!actual.has(key)) {
      ctx.health.push(finding(`${label}: missing ${key}`, key));
    }
  }
  for (const key of actual) {
    if (!expected.has(key)) {
      ctx.health.push(finding(`${label}: stale/unknown ${key}`, key));
    }
  }
}

function validateEditorBindings(ctx: GraphRead): void {
  for (const [owner, [file, symbol, suffix]] of Object.entries(EDITOR_BINDINGS)) {
    if (!fileLoaded(ctx, file)) {
      continue;
    }
    const declaration = sourceAt(ctx, file)?.getVariableDeclaration(symbol);
    const text = declaration?.getInitializer()?.getText() ?? "";
    if (!(text.includes(OWNERS_SYMBOL) && text.endsWith(suffix))) {
      ctx.health.push(finding(`editor tuple ${symbol} is not bound to ${OWNERS_SYMBOL}.${owner}`, symbol));
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

function validateRowSemantics(ctx: GraphRead, evidence: AppearanceCarrierEvidence, row: Row): void {
  if (row.carriers.length === 0) {
    ctx.occurrences.push({ node: row.node, token: row.key, offset: row.node.getText().indexOf(row.key) });
  }
  if (row.arms !== undefined && (row.arms.length !== 2 || row.arms[0] === row.arms[1])) {
    ctx.health.push(finding(`required-distinct arms for ${row.key} are equal or malformed`, row.key));
  }
  const carrier = row.carriers[0];
  if (carrier === undefined || PORTAL_BY_CARRIER[carrier] !== row.portal) {
    ctx.health.push(finding(`wrong carrier/portal obligation for ${row.key}: ${carrier ?? "none"} + ${row.portal === "" ? "none" : row.portal}`, row.key));
  }
  const liveKey = `${row.consumerFile}#${row.consumerSymbol}`;
  if (!evidence.declaredFunctions.has(liveKey)) {
    ctx.health.push(finding(`live consumer ${liveKey} for ${row.key} does not exist`, row.key));
  } else if (evidence.identifiersByFunction.get(liveKey)?.has(row.key) !== true) {
    ctx.health.push(finding(`live consumer ${liveKey} does not bind ${row.key}`, row.key));
  }
}

function validateRows(
  ctx: GraphRead,
  evidence: AppearanceCarrierEvidence,
  rows: readonly Row[],
  owners: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, number> {
  const planeCounts = new Map<string, number>();
  for (const row of rows) {
    if (owners.get(row.owner)?.includes(row.key) !== true) {
      ctx.health.push(finding(`wrong owner for ${row.key}: manifest=${row.owner || "missing"}`, row.key));
    }
    for (const plane of row.carriers) {
      planeCounts.set(plane, (planeCounts.get(plane) ?? 0) + 1);
    }
    validateRowSemantics(ctx, evidence, row);
  }
  return planeCounts;
}

function validatePlanePopulations(ctx: GraphRead, planeCounts: ReadonlyMap<string, number>): void {
  if (!fileLoaded(ctx, BOOT_FILE)) {
    return;
  }
  for (const plane of ["root-html", "theme-scope", "shell-grid", "background-layer", "message-props", "source-catalog"]) {
    if ((planeCounts.get(plane) ?? 0) === 0) {
      ctx.health.push(finding(`carrier plane ${plane} reached zero appearance keys`, plane));
    }
  }
}

function validateSnapProjection(ctx: GraphRead, evidence: AppearanceCarrierEvidence, rows: readonly Row[], prepaint: readonly string[]): void {
  if (!fileLoaded(ctx, SNAP_APPEARANCE_FILE)) {
    return;
  }
  const snapIds = evidence.identifiersByFunction.get(`${SNAP_APPEARANCE_FILE}#appearanceBootHintPatch`) ?? new Set<string>();
  const expectedSnap = new Set([...prepaint, "density"]);
  for (const key of expectedSnap) {
    if (!snapIds.has(key)) {
      ctx.health.push(finding(`Snap boot-hint projection is missing ${key}`, key));
    }
  }
  for (const row of rows) {
    if (!(expectedSnap.has(row.key) || !snapIds.has(row.key))) {
      ctx.health.push(finding(`Snap boot-hint projection wrongly includes hydrated-only ${row.key}`, row.key));
    }
  }
}

function validateLifecycle(ctx: GraphRead, evidence: AppearanceCarrierEvidence, rows: readonly Row[]): void {
  if (!(fileLoaded(ctx, BOOT_FILE) && fileLoaded(ctx, USE_APPEARANCE_FILE))) {
    return;
  }
  const prepaint = rows
    .filter((row) => row.lifecycle === "prepaint-and-hydrated")
    .map((row) => row.key)
    .sort();
  if (prepaint.join(",") !== "fontScale,reducedMotion") {
    ctx.health.push(finding(`prepaint subset drifted: ${prepaint.join(",") || "zero"}`));
  }
  const density = rows.find((row) => row.key === "density");
  if (density?.lifecycle !== "hydrated-from-prepaint-hint") {
    ctx.health.push(finding("density must remain React-only but seeded from the prepaint hint", "density"));
  }
  const stampIds = evidence.identifiersByFunction.get(`${BOOT_FILE}#stampAppearanceBootHint`) ?? new Set<string>();
  const pendingIds = evidence.identifiersByFunction.get(`${USE_APPEARANCE_FILE}#useAppearance`) ?? new Set<string>();
  for (const key of prepaint) {
    if (!(stampIds.has(key) && pendingIds.has(key))) {
      ctx.health.push(finding(`prepaint/hydrated parity is missing ${key}`, key));
    }
  }
  if (stampIds.has("density") || !pendingIds.has("density")) {
    ctx.health.push(finding("density was faked onto prepaint or dropped from the pending React carrier", "density"));
  }
  validateSnapProjection(ctx, evidence, rows, prepaint);
}

function reconcile(ctx: GraphRead): void {
  const evidence = ctx.evidence;
  if (!(fileLoaded(ctx, MANIFEST_FILE) && fileLoaded(ctx, SCHEMA_FILE))) {
    return;
  }
  const manifestSource = sourceAt(ctx, MANIFEST_FILE);
  if (manifestSource === undefined || sourceAt(ctx, SCHEMA_FILE) === undefined) {
    throw new Error("appearance carrier contract anchors were loaded but unavailable in the shared project");
  }
  const rows = manifestRows(manifestSource);
  const schema = new Set(evidence.collectedSchemaLeaves);
  if (schema.size === 0) {
    throw new Error("appearanceSettingsSchema resolved to zero leaves in the shared walk");
  }
  const owners = ownerKeys(manifestSource);
  ctx.keys = schema.size;
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
      ctx.health.push(finding(`editor owner population is ${owners.size}, expected ${Object.keys(EDITOR_BINDINGS).length}`));
    }
    validateEditorBindings(ctx);
  }
  validatePlanePopulations(ctx, validateRows(ctx, evidence, rows, owners));
  validateLifecycle(ctx, evidence, rows);
  for (const source of evidence.plantedManifestSources.values()) {
    for (const row of manifestRows(source)) {
      validateRowSemantics(ctx, evidence, row);
    }
  }
}

export function readAppearanceCarrierGraph(
  sources: ReadonlyMap<string, SourceFile>,
  evidence: AppearanceCarrierEvidence,
): {
  readonly health: readonly HealthFinding[];
  readonly occurrences: readonly CarrierOccurrence[];
  readonly keys: number;
} {
  const graph: GraphRead = { sources, evidence, health: [], occurrences: [], keys: 0 };
  reconcile(graph);
  return { health: graph.health, occurrences: graph.occurrences, keys: graph.keys };
}
