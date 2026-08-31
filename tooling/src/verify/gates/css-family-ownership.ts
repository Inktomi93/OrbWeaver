// Gate: css-family-ownership (#951 / client-architecture-lockdown.md §4.3 and §4.7).
// `sanctioned-css-homes` proves WHERE repository CSS may exist. This gate proves that a legal path is
// not a dumping-ground license: density, generated values, universal UI mechanisms, client mechanisms,
// and shell structure retain their dependency direction inside that closed set.
//
// The wall is syntax/provenance based. It deliberately has no `@orb-css-family` comment DSL and no
// property-keyword classifier: either would let an author bless the wrong rule with the right word.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Symbol as MorphSymbol, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { blankCssComments } from "../lib/comment-spans.ts";
import { parseCssRules, splitSelectorList } from "../lib/css-rules.ts";
import { repoRel } from "../lib/pass.ts";

const THEME = "packages/ui/src/styles/theme.css";
const UI_GLOBALS = "packages/ui/src/styles/globals.css";
const TIERS = "packages/ui/src/styles/tiers.css";
const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const SHELL = "packages/client/src/features/app-shell/surfaces/shell.css";
const PRODUCT_STYLESHEETS = [THEME, UI_GLOBALS, TIERS, CLIENT_GLOBALS, SHELL] as const;
const AUTHORED_STYLESHEETS = [UI_GLOBALS, TIERS, CLIENT_GLOBALS, SHELL] as const;

type ProductStylesheet = (typeof PRODUCT_STYLESHEETS)[number];

interface DirectDeclaration {
  readonly prop: string;
  readonly value: string;
  readonly line: number;
}

interface StylesheetCensus {
  readonly rel: ProductStylesheet;
  readonly raw: string;
  readonly rules: ReturnType<typeof parseCssRules>;
  readonly directTheme: readonly DirectDeclaration[];
  readonly declarations: number;
}

interface HookOwners {
  readonly ui: boolean;
  readonly client: boolean;
}

const DENSITY_SPACING = new Set(["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"]);
const DENSITY_SELECTORS = new Set(['[data-density="comfortable"]', '[data-density="compact"]']);
const CLIENT_BLUR_FILL = new Set(["--blur-fill-chrome", "--blur-fill-dense"]);
const CLIENT_COLORIZATION = new Set(["--color-border", "--color-sidebar-border"]);
const LOCAL_FADE_STOP_RE = /^--fade-(?:start|end|top|bottom)-stop$/u;
const KEYFRAME_STEP_RE = /^(?:from|to|\d+%(?:\s*,\s*\d+%)*)$/u;
const CSS_CLASS_RE = /\.([_a-zA-Z][\w-]*)/gu;
const DATA_SLOT_RE = /\[data-slot="([^"]+)"\]/gu;
const KNOWN_DENSITY_FLOOR = '[data-slot="list-row-subtitle"][data-subtitle-step="label"]';
const CLASS_TOKEN_RE = /^[A-Za-z_][\w-]*$/u;
const EXPECTED_RUNTIME_WRITERS = {
  density: DENSITY_SPACING.size * DENSITY_SELECTORS.size,
  blur: CLIENT_BLUR_FILL.size * 2,
  colorization: CLIENT_COLORIZATION.size * 2,
  fade: 12,
} as const;
const EXPECTED_DIRECT_CLIENT_UI_MECHANISMS = {
  "slot:dialog-popup": 1,
  "slot:alert-dialog-popup": 1,
  "slot:message-list-scroll": 3,
} as const;
const SOURCE_OWNERS = [
  { prefix: "packages/ui/src/", owner: "ui" },
  { prefix: "packages/client/src/", owner: "client" },
] as const;
const CLASS_LIST_MUTATORS = new Set(["add", "remove", "toggle", "replace"]);
const CLASS_PROPERTIES = new Set(["class", "className"]);
const CLASS_NAME_ASSIGNMENT_OPERATORS = new Set(["=", "+=", "&&=", "||=", "??="]);
const CLASS_PRODUCER_MODULE = "/packages/ui/src/lib/class-merge.ts";
const EXPECTED_DECLARATION_CENSUS: Readonly<Record<ProductStylesheet, number>> = {
  [THEME]: 275,
  [UI_GLOBALS]: 187,
  [TIERS]: 45,
  [CLIENT_GLOBALS]: 111,
  [SHELL]: 335,
};
const EXPECTED_DECLARATION_TOTAL = 953;
const EXPECTED_DIRECT_THEME_DECLARATIONS = 179;
const CENSUS_TOKEN: Readonly<Record<ProductStylesheet, string>> = {
  [THEME]: "census:theme",
  [UI_GLOBALS]: "census:ui-globals",
  [TIERS]: "census:tiers",
  [CLIENT_GLOBALS]: "census:client-globals",
  [SHELL]: "census:shell",
};

const MESSAGE =
  "a declaration is inside a sanctioned CSS path but belongs to another semantic family (#951 / client-architecture-lockdown.md §4.3): legal path is not responsibility";

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    line += text.charCodeAt(index) === 10 ? 1 : 0;
  }
  return line;
}

function nextQuote(current: string, char: string, escaped: boolean): string {
  if (current !== "") {
    return char === current && !escaped ? "" : current;
  }
  return char === '"' || char === "'" ? char : "";
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let quote = "";
  for (let index = open + 1; index < text.length; index += 1) {
    const char = text[index] ?? "";
    const beforeQuote = quote;
    quote = nextQuote(quote, char, text[index - 1] === "\\");
    if (beforeQuote !== "" || quote !== "") {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }
  return -1;
}

/** Preserve direct text/line offsets while erasing nested blocks. A line-anchored declaration regex by
 * itself cannot distinguish a direct `@theme` declaration from one nested inside a future at-rule. */
function nestedChar(char: string, depth: number): string {
  return depth > 0 && char !== "\n" ? " " : char;
}

function blankNestedBlocks(text: string): string {
  const chars = [...text];
  let depth = 0;
  let quote = "";
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? "";
    const beforeQuote = quote;
    quote = nextQuote(quote, char, text[index - 1] === "\\");
    if (beforeQuote !== "" || quote !== "") {
      chars[index] = nestedChar(char, depth);
      continue;
    }
    if (char === "{") {
      depth += 1;
    }
    chars[index] = nestedChar(char, depth);
    if (char === "}") {
      depth -= 1;
    }
  }
  return chars.join("");
}

/** Direct declarations of the generated `@theme` block. `parseCssRules` correctly descends through
 *  at-rules to STYLE rules, but direct declarations in an at-rule are intentionally not style rules. */
export function readDirectThemeDeclarations(raw: string): readonly DirectDeclaration[] {
  const text = blankCssComments(raw);
  const match = /@theme\s*\{/u.exec(text);
  if (match === null) {
    return [];
  }
  const open = match.index + match[0].lastIndexOf("{");
  const close = matchingBrace(text, open);
  if (close === -1) {
    return [];
  }
  const body = blankNestedBlocks(text.slice(open + 1, close));
  const out: DirectDeclaration[] = [];
  for (const declaration of body.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gmu)) {
    const prop = declaration[1];
    const value = declaration[2];
    if (prop !== undefined && value !== undefined) {
      out.push({ prop, value: value.trim(), line: lineAt(text, open + 1 + declaration.index + declaration[0].indexOf(prop)) });
    }
  }
  return out;
}

function readCensus(root: string): readonly StylesheetCensus[] {
  return PRODUCT_STYLESHEETS.flatMap((rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      return [];
    }
    const raw = readFileSync(abs, "utf8");
    const rules = parseCssRules(raw);
    const directTheme = rel === THEME ? readDirectThemeDeclarations(raw) : [];
    return [{ rel, raw, rules, directTheme, declarations: directTheme.length + rules.reduce((sum, rule) => sum + rule.declarations.length, 0) }];
  });
}

function finding(file: string, line: number, token: string, message: string): Finding {
  // @finding-overload-ok: CSS is filesystem text, not a ts-morph node; the depth-aware parser supplies the exact file/line/token and CSS has no @orb-gate-ignore grammar to preserve. Ends if the gate runner exposes CSS nodes with the shared suppression contract.
  return { file, line, column: 1, token, message };
}

function sourceOwner(rel: string): "ui" | "client" | undefined {
  return SOURCE_OWNERS.find((row) => rel.startsWith(row.prefix))?.owner;
}

function recordOwner(map: Map<string, HookOwners>, hook: string, owner: "ui" | "client"): void {
  const before = map.get(hook) ?? { ui: false, client: false };
  map.set(hook, { ui: before.ui || owner === "ui", client: before.client || owner === "client" });
}

function recordClassTokens(map: Map<string, HookOwners>, text: string, owner: "ui" | "client"): void {
  for (const token of text.split(/\s+/u)) {
    if (CLASS_TOKEN_RE.test(token)) {
      recordOwner(map, `class:${token}`, owner);
    }
  }
}

function resolveExportedVariable(sf: SourceFile, name: string, seen: Set<string>): Node | undefined {
  const key = `${sf.getFilePath()}:${name}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  const local = sf.getVariableDeclaration(name);
  if (local !== undefined) {
    return local;
  }
  for (const declaration of sf.getExportDeclarations()) {
    const target = declaration.getModuleSpecifierSourceFile();
    if (target === undefined) {
      continue;
    }
    const named = declaration.getNamedExports().find((candidate) => (candidate.getAliasNode() ?? candidate.getNameNode()).getText() === name);
    if (named !== undefined) {
      return resolveExportedVariable(target, named.getNameNode().getText(), seen);
    }
    if (declaration.getNamedExports().length === 0) {
      const found = resolveExportedVariable(target, name, seen);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return local;
}

function resolveName(sf: SourceFile, name: string): Node | undefined {
  const local = sf.getVariableDeclaration(name);
  if (local !== undefined) {
    return local;
  }
  for (const declaration of sf.getImportDeclarations()) {
    const named = declaration.getNamedImports().find((candidate) => (candidate.getAliasNode() ?? candidate.getNameNode()).getText() === name);
    if (named === undefined) {
      continue;
    }
    const target = declaration.getModuleSpecifierSourceFile();
    const original = named.getNameNode().getText();
    const found = target === undefined ? undefined : resolveExportedVariable(target, original, new Set());
    if (found !== undefined) {
      return found;
    }
  }
  return local;
}

type ClassProducer = "cn" | "tv";

function normalizedSourcePath(node: Node): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
}

function declaredName(node: Node): string | undefined {
  return Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node) ? node.getName() : undefined;
}

function canonicalProducer(node: Node): ClassProducer | undefined {
  if (!normalizedSourcePath(node).endsWith(CLASS_PRODUCER_MODULE)) {
    return;
  }
  const name = declaredName(node);
  return name === "cn" || name === "tv" ? name : undefined;
}

function producerFromForwardedValue(candidate: Node, seen: Set<string>): ClassProducer | undefined {
  const node = unwrapExpression(candidate);
  const fromCall = Node.isCallExpression(node) ? producerForExpression(node.getExpression(), seen) : undefined;
  const operator = Node.isBinaryExpression(node) ? node.getOperatorToken().getText() : undefined;
  const fromFallback =
    Node.isBinaryExpression(node) && (operator === "??" || operator === "||")
      ? (producerFromForwardedValue(node.getLeft(), seen) ?? producerFromForwardedValue(node.getRight(), seen))
      : undefined;
  return fromCall ?? fromFallback;
}

function producerFromForwarder(node: Node | undefined, seen: Set<string>): ClassProducer | undefined {
  if (!Node.isArrowFunction(node)) {
    return;
  }
  const body = node.getBody();
  return Node.isBlock(body) ? undefined : producerFromForwardedValue(body, seen);
}

function symbolKey(symbol: MorphSymbol): string {
  const declarations = symbol.getDeclarations();
  return `${symbol.getName()}:${declarations.map((node) => `${normalizedSourcePath(node)}:${node.getStart()}`).join("|")}`;
}

function producerFromDeclaration(node: Node, seen: Set<string>): ClassProducer | undefined {
  const direct = canonicalProducer(node);
  const initializer = Node.isVariableDeclaration(node) ? node.getInitializer() : undefined;
  const fromVariable = initializer === undefined ? undefined : (producerForExpression(initializer, seen) ?? producerFromForwarder(initializer, seen));
  const fromExport = Node.isExportSpecifier(node)
    ? node
        .getLocalTargetDeclarations()
        .map((target) => producerFromDeclaration(target, seen))
        .find((producer) => producer !== undefined)
    : undefined;
  return direct ?? fromVariable ?? fromExport;
}

function producerFromSymbol(symbol: MorphSymbol | undefined, seen: Set<string>): ClassProducer | undefined {
  if (symbol === undefined) {
    return;
  }
  const key = symbolKey(symbol);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  const aliased = symbol.getAliasedSymbol();
  const fromAlias = aliased === undefined ? undefined : producerFromSymbol(aliased, seen);
  return (
    fromAlias ??
    symbol
      .getDeclarations()
      .map((declaration) => producerFromDeclaration(declaration, seen))
      .find((producer) => producer !== undefined)
  );
}

function producerFromIdentifier(node: Node, seen: Set<string>): ClassProducer | undefined {
  if (!Node.isIdentifier(node)) {
    return;
  }
  const bySymbol = producerFromSymbol(node.getSymbol(), seen);
  if (bySymbol !== undefined) {
    return bySymbol;
  }
  return node
    .getDefinitionNodes()
    .map((definition) => producerFromDeclaration(definition, seen))
    .find((producer) => producer !== undefined);
}

function producerFromPropertyAccess(node: Node, seen: Set<string>): ClassProducer | undefined {
  return Node.isPropertyAccessExpression(node) ? producerFromSymbol(node.getNameNode().getSymbol() ?? node.getSymbol(), seen) : undefined;
}

function producerFromElementAccess(node: Node, seen: Set<string>): ClassProducer | undefined {
  if (!Node.isElementAccessExpression(node)) {
    return;
  }
  const candidateArgument = node.getArgumentExpression();
  if (candidateArgument === undefined) {
    return;
  }
  const argument = unwrapExpression(candidateArgument);
  if (!(Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument))) {
    return;
  }
  return producerFromSymbol(argument.getSymbol() ?? node.getExpression().getType().getProperty(argument.getLiteralText()), seen);
}

function producerForExpression(candidate: Node, seen = new Set<string>()): ClassProducer | undefined {
  const node = unwrapExpression(candidate);
  return producerFromIdentifier(node, seen) ?? producerFromPropertyAccess(node, seen) ?? producerFromElementAccess(node, seen);
}

function ownersForNode(node: Node, inherited: ReadonlySet<"ui" | "client">): ReadonlySet<"ui" | "client"> {
  const path = node.getSourceFile().getFilePath();
  const packagesAt = path.indexOf("/packages/");
  const declared = sourceOwner(packagesAt === -1 ? path : path.slice(packagesAt + 1));
  return declared === undefined ? inherited : new Set([...inherited, declared]);
}

function recordTextForOwners(map: Map<string, HookOwners>, text: string, owners: ReadonlySet<"ui" | "client">): void {
  for (const owner of owners) {
    recordClassTokens(map, text, owner);
  }
}

function recordPropertyKey(map: Map<string, HookOwners>, node: Node, owners: ReadonlySet<"ui" | "client">): void {
  if (Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) {
    const name = node.getName().replace(/^['"]|['"]$/gu, "");
    recordTextForOwners(map, name, owners);
  }
}

/** Follow only values that are already inside an actual class-producing carrier. An identifier gains the
 * owner of its definition as well as the owner of its live use, which is how an exported \@orb/ui class
 * constant remains UI-owned when a client className composes it. */
interface ClassValueContext {
  readonly map: Map<string, HookOwners>;
  readonly owners: ReadonlySet<"ui" | "client">;
  readonly seen: Set<string>;
}

function collectLiteralClassValue(node: Node, context: ClassValueContext): boolean {
  const { map, owners } = context;
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    recordTextForOwners(map, node.getLiteralText(), owners);
    return true;
  }
  if (!Node.isTemplateExpression(node)) {
    return false;
  }
  recordTextForOwners(map, node.getHead().getLiteralText(), owners);
  for (const span of node.getTemplateSpans()) {
    collectClassValue(span.getExpression(), context);
    recordTextForOwners(map, span.getLiteral().getLiteralText(), owners);
  }
  return true;
}

function collectIdentifierClassValue(node: Node, context: ClassValueContext, objectKeysAreClasses: boolean): boolean {
  if (!Node.isIdentifier(node)) {
    return false;
  }
  const declaration = resolveName(node.getSourceFile(), node.getText());
  if (!Node.isVariableDeclaration(declaration)) {
    return true;
  }
  const key = `${declaration.getSourceFile().getFilePath()}:${declaration.getStart()}`;
  const initializer = declaration.getInitializer();
  if (context.seen.has(key) || initializer === undefined) {
    return true;
  }
  context.seen.add(key);
  collectClassValue(initializer, { ...context, owners: ownersForNode(declaration, context.owners) }, objectKeysAreClasses);
  context.seen.delete(key);
  return true;
}

function collectBranchClassValue(node: Node, context: ClassValueContext, objectKeysAreClasses: boolean): boolean {
  if (Node.isConditionalExpression(node)) {
    collectClassValue(node.getWhenTrue(), context, objectKeysAreClasses);
    collectClassValue(node.getWhenFalse(), context, objectKeysAreClasses);
    return true;
  }
  if (Node.isBinaryExpression(node)) {
    collectClassValue(node.getLeft(), context, objectKeysAreClasses);
    collectClassValue(node.getRight(), context, objectKeysAreClasses);
    return true;
  }
  if (!Node.isArrayLiteralExpression(node)) {
    return false;
  }
  for (const element of node.getElements()) {
    collectClassValue(element, context, objectKeysAreClasses);
  }
  return true;
}

function classObjectPropertyValue(property: Node): Node | undefined {
  if (Node.isPropertyAssignment(property)) {
    return property.getInitializer();
  }
  if (Node.isShorthandPropertyAssignment(property)) {
    return property.getNameNode();
  }
  return Node.isSpreadAssignment(property) ? property.getExpression() : undefined;
}

function collectObjectClassValue(node: Node, context: ClassValueContext, objectKeysAreClasses: boolean): boolean {
  if (!Node.isObjectLiteralExpression(node)) {
    return false;
  }
  const { map, owners, seen } = context;
  for (const property of node.getProperties()) {
    if (objectKeysAreClasses) {
      recordPropertyKey(map, property, owners);
    }
    const value = classObjectPropertyValue(property);
    if (value !== undefined) {
      collectClassValue(value, { map, owners, seen }, Node.isSpreadAssignment(property) && objectKeysAreClasses);
    }
  }
  return true;
}

function collectClassValue(candidate: Node, context: ClassValueContext, objectKeysAreClasses = false): void {
  const node = unwrapExpression(candidate);
  if (
    collectLiteralClassValue(node, context) ||
    collectIdentifierClassValue(node, context, objectKeysAreClasses) ||
    collectBranchClassValue(node, context, objectKeysAreClasses) ||
    collectObjectClassValue(node, context, objectKeysAreClasses)
  ) {
    return;
  }
  if (Node.isCallExpression(node)) {
    const producer = producerForExpression(node.getExpression());
    if (producer !== undefined) {
      collectComposerCall(node, producer, context);
    }
  }
}

function namedProperty(object: Node, name: string): Node | undefined {
  if (!Node.isObjectLiteralExpression(object)) {
    return;
  }
  const property = object.getProperty(name);
  return Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
}

function collectObjectValues(object: Node, context: ClassValueContext): void {
  if (!Node.isObjectLiteralExpression(object)) {
    return;
  }
  for (const property of object.getProperties()) {
    if (Node.isPropertyAssignment(property)) {
      const initializer = property.getInitializer();
      if (initializer !== undefined) {
        collectClassValue(initializer, context);
      }
    } else if (Node.isShorthandPropertyAssignment(property)) {
      collectClassValue(property.getNameNode(), context);
    }
  }
}

function collectNamedVariantValues(object: Node, context: ClassValueContext): void {
  for (const key of ["base", "class", "className"]) {
    const value = namedProperty(object, key);
    if (value !== undefined) {
      collectClassValue(value, context);
    }
  }
  const slots = namedProperty(object, "slots");
  if (slots !== undefined) {
    collectObjectValues(unwrapExpression(slots), context);
  }
}

function collectVariantAxes(object: Node, context: ClassValueContext): void {
  const variants = namedProperty(object, "variants");
  const variantsObject = variants === undefined ? undefined : unwrapExpression(variants);
  if (!Node.isObjectLiteralExpression(variantsObject)) {
    return;
  }
  for (const axis of variantsObject.getProperties()) {
    const initializer = Node.isPropertyAssignment(axis) ? axis.getInitializer() : undefined;
    if (initializer !== undefined) {
      collectObjectValues(unwrapExpression(initializer), context);
    }
  }
}

function collectCompoundVariantGroups(object: Node, context: ClassValueContext): void {
  for (const key of ["compoundVariants", "compoundSlots"]) {
    const compound = namedProperty(object, key);
    const compoundArray = compound === undefined ? undefined : unwrapExpression(compound);
    if (!Node.isArrayLiteralExpression(compoundArray)) {
      continue;
    }
    for (const entry of compoundArray.getElements()) {
      const row = unwrapExpression(entry);
      for (const classKey of ["class", "className"]) {
        const value = namedProperty(row, classKey);
        if (value !== undefined) {
          collectClassValue(value, context);
        }
      }
    }
  }
}

function collectVariantConfig(config: Node, context: ClassValueContext): void {
  const object = unwrapExpression(config);
  if (!Node.isObjectLiteralExpression(object)) {
    collectClassValue(object, context);
    return;
  }
  collectNamedVariantValues(object, context);
  collectVariantAxes(object, context);
  collectCompoundVariantGroups(object, context);
}

function collectComposerCall(call: Node, producer: ClassProducer, context: ClassValueContext): void {
  if (!Node.isCallExpression(call)) {
    return;
  }
  if (producer === "tv") {
    const config = call.getArguments()[0];
    if (config !== undefined) {
      collectVariantConfig(config, context);
    }
    return;
  }
  for (const argument of call.getArguments()) {
    collectClassValue(argument, context, true);
  }
}

function collectClassAttribute(map: Map<string, HookOwners>, attribute: Node, owner: "ui" | "client"): void {
  if (!(Node.isJsxAttribute(attribute) && CLASS_PROPERTIES.has(attribute.getNameNode().getText()))) {
    return;
  }
  const initializer = attribute.getInitializer();
  if (initializer === undefined) {
    return;
  }
  if (Node.isStringLiteral(initializer)) {
    recordClassTokens(map, initializer.getLiteralText(), owner);
    return;
  }
  const expression = Node.isJsxExpression(initializer) ? initializer.getExpression() : undefined;
  if (expression !== undefined) {
    collectClassValue(expression, { map, owners: new Set([owner]), seen: new Set() });
  }
}

function literalValues(candidate: Node, seen: Set<string>): readonly string[] {
  const node = unwrapExpression(candidate);
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return [node.getLiteralText()];
  }
  if (Node.isIdentifier(node)) {
    const declaration = resolveName(node.getSourceFile(), node.getText());
    if (!Node.isVariableDeclaration(declaration)) {
      return [];
    }
    const key = `${declaration.getSourceFile().getFilePath()}:${declaration.getStart()}`;
    const initializer = declaration.getInitializer();
    if (initializer === undefined || seen.has(key)) {
      return [];
    }
    seen.add(key);
    const values = literalValues(initializer, seen);
    seen.delete(key);
    return values;
  }
  if (Node.isConditionalExpression(node)) {
    return [...literalValues(node.getWhenTrue(), seen), ...literalValues(node.getWhenFalse(), seen)];
  }
  return [];
}

function dataSlotValues(initializer: Node | undefined): readonly string[] {
  if (initializer === undefined) {
    return [];
  }
  if (Node.isStringLiteral(initializer)) {
    return [initializer.getLiteralText()];
  }
  if (!Node.isJsxExpression(initializer)) {
    return [];
  }
  const expression = initializer.getExpression();
  return expression === undefined ? [] : literalValues(expression, new Set());
}

function collectDataSlotAttribute(map: Map<string, HookOwners>, attribute: Node, owner: "ui" | "client"): void {
  if (!Node.isJsxAttribute(attribute) || attribute.getNameNode().getText() !== "data-slot") {
    return;
  }
  const initializer = attribute.getInitializer();
  for (const value of dataSlotValues(initializer)) {
    recordOwner(map, `slot:${value}`, owner);
  }
}

function accessedPropertyName(node: Node): string | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return node.getName();
  }
  if (!Node.isElementAccessExpression(node)) {
    return;
  }
  const candidateArgument = node.getArgumentExpression();
  if (candidateArgument === undefined) {
    return;
  }
  const argument = unwrapExpression(candidateArgument);
  return Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument) ? argument.getLiteralText() : undefined;
}

function accessReceiver(node: Node): Node | undefined {
  return Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node) ? node.getExpression() : undefined;
}

function collectClassMutation(map: Map<string, HookOwners>, call: Node, owner: "ui" | "client"): void {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const expression = call.getExpression();
  const receiver = accessReceiver(expression);
  if (receiver === undefined || !CLASS_LIST_MUTATORS.has(accessedPropertyName(expression) ?? "") || accessedPropertyName(receiver) !== "classList") {
    return;
  }
  for (const argument of call.getArguments()) {
    collectClassValue(argument, { map, owners: new Set([owner]), seen: new Set() });
  }
}

function collectClassAssignment(map: Map<string, HookOwners>, binary: Node, owner: "ui" | "client"): void {
  if (
    !Node.isBinaryExpression(binary) ||
    accessedPropertyName(unwrapExpression(binary.getLeft())) !== "className" ||
    !CLASS_NAME_ASSIGNMENT_OPERATORS.has(binary.getOperatorToken().getText())
  ) {
    return;
  }
  collectClassValue(binary.getRight(), { map, owners: new Set([owner]), seen: new Set() });
}

/** Producer direction from actual class-bearing syntax only: class/className attributes, the repo's class
 * composers, and DOMTokenList mutations. Inert UI copy is deliberately invisible. */
function collectHookAttributes(owners: Map<string, HookOwners>, sf: SourceFile, owner: "ui" | "client"): void {
  for (const attribute of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    collectClassAttribute(owners, attribute, owner);
    collectDataSlotAttribute(owners, attribute, owner);
  }
}

function collectHookProperties(owners: Map<string, HookOwners>, sf: SourceFile, owner: "ui" | "client"): void {
  for (const property of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (!CLASS_PROPERTIES.has(property.getName().replace(/^['"]|['"]$/gu, ""))) {
      continue;
    }
    const initializer = property.getInitializer();
    if (initializer !== undefined) {
      collectClassValue(initializer, { map: owners, owners: new Set([owner]), seen: new Set() });
    }
  }
}

function collectHookCalls(owners: Map<string, HookOwners>, sf: SourceFile, owner: "ui" | "client"): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const producer = producerForExpression(call.getExpression());
    if (producer !== undefined) {
      collectComposerCall(call, producer, { map: owners, owners: new Set([owner]), seen: new Set() });
    }
    collectClassMutation(owners, call, owner);
  }
}

function collectHookAssignments(owners: Map<string, HookOwners>, sf: SourceFile, owner: "ui" | "client"): void {
  for (const binary of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    collectClassAssignment(owners, binary, owner);
  }
}

function collectHookOwners(ctx: GateRunCtx): ReadonlyMap<string, HookOwners> {
  const owners = new Map<string, HookOwners>();
  for (const sf of ctx.project.getSourceFiles()) {
    const owner = sourceOwner(repoRel(ctx.root, sf.getFilePath()));
    if (owner === undefined) {
      continue;
    }
    collectHookAttributes(owners, sf, owner);
    collectHookProperties(owners, sf, owner);
    collectHookCalls(owners, sf, owner);
    collectHookAssignments(owners, sf, owner);
  }
  return owners;
}

function selectorHooks(selector: string): readonly string[] {
  const hooks: string[] = [];
  for (const match of selector.matchAll(CSS_CLASS_RE)) {
    if (match[1] !== undefined) {
      hooks.push(`class:${match[1]}`);
    }
  }
  for (const match of selector.matchAll(DATA_SLOT_RE)) {
    if (match[1] !== undefined) {
      hooks.push(`slot:${match[1]}`);
    }
  }
  return hooks;
}

function hasClientMechanismCarrier(selector: string): boolean {
  return (
    selector.includes("html[data-") || selector.includes(".shell-grid") || selector.includes("[data-has-bg-image]") || selector.includes("[data-reduced-motion")
  );
}

function themeFamilyPrefixes(directTheme: readonly DirectDeclaration[]): ReadonlySet<string> {
  const prefixes = new Set<string>();
  for (const { prop } of directTheme) {
    const family = /^--([a-z0-9]+)-/u.exec(prop)?.[1];
    if (family !== undefined) {
      prefixes.add(`--${family}-`);
    }
  }
  return prefixes;
}

function isGeneratedFamily(prop: string, prefixes: ReadonlySet<string>): boolean {
  for (const prefix of prefixes) {
    if (prop.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function runtimeWriter(rel: ProductStylesheet, selector: string, declaration: DirectDeclaration): "density" | "blur" | "colorization" | "fade" | undefined {
  if (rel === TIERS && DENSITY_SELECTORS.has(selector) && DENSITY_SPACING.has(declaration.prop)) {
    return "density";
  }
  if (rel === CLIENT_GLOBALS && selector === ":root" && CLIENT_BLUR_FILL.has(declaration.prop)) {
    return "blur";
  }
  if (
    rel === CLIENT_GLOBALS &&
    selector.includes("[data-theme-colorization]") &&
    CLIENT_COLORIZATION.has(declaration.prop) &&
    declaration.value.startsWith("color-mix(")
  ) {
    return "colorization";
  }
  return (rel === UI_GLOBALS || rel === CLIENT_GLOBALS) && LOCAL_FADE_STOP_RE.test(declaration.prop) ? "fade" : undefined;
}

function isTierSelector(selector: string): boolean {
  return selector.includes("[data-surface-tier") || DENSITY_SELECTORS.has(selector) || selector === KNOWN_DENSITY_FLOOR;
}

function reportDensityArmCompleteness(row: StylesheetCensus, ctx: GateRunCtx): void {
  if (row.rel !== TIERS) {
    return;
  }
  const densityRules = row.rules.filter((rule) => rule.selectors.some((selector) => DENSITY_SELECTORS.has(selector)));
  if (densityRules.length === 0) {
    return;
  }
  for (const selector of DENSITY_SELECTORS) {
    const declarations = densityRules
      .filter((rule) => rule.selectors.includes(selector))
      .flatMap((rule) => rule.declarations)
      .filter((declaration) => DENSITY_SPACING.has(declaration.prop));
    if (declarations.length !== DENSITY_SPACING.size) {
      ctx.report(
        finding(
          TIERS,
          densityRules[0]?.line ?? 1,
          `density-arm:${selector}`,
          `${selector} must write all ${DENSITY_SPACING.size} density spacing intents; found ${declarations.length}`,
        ),
      );
    }
  }
}

function isKeyframeStep(selector: string): boolean {
  return KEYFRAME_STEP_RE.test(selector);
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

interface SelectorFunction {
  readonly name: string;
  readonly argumentsText: string;
  readonly open: number;
  readonly close: number;
}

function matchingSelectorClose(text: string, open: number, close: ")" | "]"): number {
  let state: SelectorLexState = { depth: 0, bracketDepth: 0, quote: "" };
  for (let index = open + 1; index < text.length; index += 1) {
    const char = text[index] ?? "";
    const step = selectorLexStep(state, char, isEscaped(text, index));
    if (step.atTopLevel && char === close) {
      return index;
    }
    state = step.next;
  }
  return -1;
}

interface SelectorLexState {
  readonly depth: number;
  readonly bracketDepth: number;
  readonly quote: string;
}

function nextBracketDepth(depth: number, char: string): number {
  if (char === "[") {
    return depth + 1;
  }
  return char === "]" ? depth - 1 : depth;
}

function nextParenDepth(depth: number, char: string): number {
  if (char === "(") {
    return depth + 1;
  }
  return char === ")" ? depth - 1 : depth;
}

function selectorLexStep(state: SelectorLexState, char: string, escaped: boolean): { readonly next: SelectorLexState; readonly atTopLevel: boolean } {
  const quote = nextQuote(state.quote, char, escaped);
  if (state.quote !== "" || quote !== "") {
    return { next: { ...state, quote }, atTopLevel: false };
  }
  const atTopLevel = state.depth === 0 && state.bracketDepth === 0;
  const bracketDepth = nextBracketDepth(state.bracketDepth, char);
  const depth = bracketDepth === 0 ? nextParenDepth(state.depth, char) : state.depth;
  return { next: { depth, bracketDepth, quote }, atTopLevel };
}

type SelectorCombinator = "descendant" | "child" | "sibling";

interface SelectorChain {
  readonly compounds: readonly string[];
  readonly combinators: readonly SelectorCombinator[];
}

interface SelectorBoundary {
  readonly combinator: SelectorCombinator;
  readonly width: number;
}

function selectorBoundary(selector: string, index: number): SelectorBoundary | undefined {
  const char = selector[index] ?? "";
  if (/\s/u.test(char)) {
    return { combinator: "descendant", width: 1 };
  }
  if (char === ">") {
    return { combinator: "child", width: 1 };
  }
  if (char === "+" || char === "~") {
    return { combinator: "sibling", width: 1 };
  }
  return char === "|" && selector[index + 1] === "|" ? { combinator: "sibling", width: 2 } : undefined;
}

function selectorChain(selector: string): SelectorChain {
  const compounds: string[] = [];
  const combinators: SelectorCombinator[] = [];
  let state: SelectorLexState = { depth: 0, bracketDepth: 0, quote: "" };
  let current = "";
  let pending: SelectorCombinator | undefined;

  function pushCurrent(): void {
    const compound = current.trim();
    current = "";
    if (compound === "") {
      return;
    }
    if (compounds.length > 0) {
      combinators.push(pending ?? "descendant");
    }
    compounds.push(compound);
    pending = undefined;
  }

  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index] ?? "";
    const escaped = isEscaped(selector, index);
    const step = selectorLexStep(state, char, escaped);
    state = step.next;
    const boundary = step.atTopLevel && !escaped ? selectorBoundary(selector, index) : undefined;
    if (boundary === undefined) {
      current += char;
      continue;
    }
    pushCurrent();
    if (boundary.combinator !== "descendant" || pending === undefined) {
      pending = boundary.combinator;
    }
    index += boundary.width - 1;
  }
  pushCurrent();
  return { compounds, combinators };
}

function selectorFunctionAt(compound: string, index: number): SelectorFunction | undefined {
  const name = /^:([a-z-]+)\(/u.exec(compound.slice(index))?.[1];
  if (name === undefined) {
    return;
  }
  const open = index + name.length + 1;
  const close = matchingSelectorClose(compound, open, ")");
  return close === -1 ? undefined : { name, argumentsText: compound.slice(open + 1, close), open, close };
}

function matchingBracket(text: string, open: number): number {
  return matchingSelectorClose(text, open, "]");
}

function attributeName(compound: string, open: number, close: number): string | undefined {
  return /^\s*([_a-zA-Z][\w-]*)/u.exec(compound.slice(open + 1, close))?.[1];
}

interface ShellCompoundToken {
  readonly close: number;
  readonly rooted: boolean;
}

function shellAttributeAt(compound: string, index: number): ShellCompoundToken | undefined {
  if (compound[index] !== "[") {
    return;
  }
  const close = matchingBracket(compound, index);
  return { close, rooted: close !== -1 && attributeName(compound, index, close)?.startsWith("data-shell-") === true };
}

function shellFunctionAt(compound: string, index: number): ShellCompoundToken | undefined {
  if (compound[index] !== ":") {
    return;
  }
  const fn = selectorFunctionAt(compound, index);
  if (fn === undefined) {
    return;
  }
  const branches = splitSelectorList(fn.argumentsText);
  const rooted = (fn.name === "is" || fn.name === "where") && branches.length > 0 && branches.every((branch) => isShellSelector(branch));
  return { close: fn.close, rooted };
}

function shellClassAt(compound: string, index: number): boolean {
  return compound[index] === "." && /^\.shell-[\w-]+/u.test(compound.slice(index));
}

function compoundHasShellRoot(compound: string): boolean {
  for (let index = 0; index < compound.length; index += 1) {
    if (isEscaped(compound, index)) {
      continue;
    }
    const token = shellAttributeAt(compound, index) ?? shellFunctionAt(compound, index);
    if (token !== undefined) {
      if (token.rooted) {
        return true;
      }
      index = token.close === -1 ? compound.length : token.close;
      continue;
    }
    if (shellClassAt(compound, index)) {
      return true;
    }
  }
  return false;
}

function isShellSelector(selector: string): boolean {
  const text = selector.trim();
  if (isKeyframeStep(text) || text === ":root") {
    return true;
  }
  const chain = selectorChain(text);
  if (text.startsWith("::view-transition-")) {
    return chain.compounds.length === 1 && chain.compounds[0] === text;
  }
  for (let index = chain.compounds.length - 1; index >= 0; index -= 1) {
    const compound = chain.compounds[index];
    if (compound !== undefined && compoundHasShellRoot(compound)) {
      return true;
    }
    if (index > 0 && chain.combinators[index - 1] === "sibling") {
      return false;
    }
  }
  return false;
}

function actualLayerOffsets(raw: string): readonly number[] {
  const text = blankCssComments(raw);
  return [...text.matchAll(/@layer(?=\s|\{)/gu)].map((match) => match.index);
}

function reportUiDependencyDirection(census: StylesheetCensus, owners: ReadonlyMap<string, HookOwners>, ctx: GateRunCtx): void {
  const reported = new Set<string>();
  for (const rule of census.rules) {
    for (const selector of rule.selectors) {
      for (const hook of selectorHooks(selector)) {
        const owner = owners.get(hook);
        if (owner?.client !== true || owner.ui || reported.has(hook)) {
          continue;
        }
        reported.add(hook);
        ctx.report(
          finding(
            UI_GLOBALS,
            rule.line,
            hook,
            `UI globals selects ${hook}, but live TS/TSX producers exist only under packages/client/src — move the mechanism to client globals or move a genuinely universal driver into @orb/ui`,
          ),
        );
      }
    }
  }
}

function bareUiSlots(selector: string, owners: ReadonlyMap<string, HookOwners>): readonly string[] {
  if (hasClientMechanismCarrier(selector)) {
    return [];
  }
  return selectorHooks(selector).filter((hook) => {
    const owner = owners.get(hook);
    return hook.startsWith("slot:") && owner?.ui === true && !owner.client;
  });
}

function isDirectClientUiMechanism(hook: string, selector: string): boolean {
  if (hook === "slot:message-list-scroll") {
    return true;
  }
  return (hook === "slot:dialog-popup" || hook === "slot:alert-dialog-popup") && selector.startsWith("html ");
}

function reportClientComponentSkins(
  census: StylesheetCensus,
  owners: ReadonlyMap<string, HookOwners>,
  directClientCounts: Map<string, number>,
  ctx: GateRunCtx,
): void {
  for (const rule of census.rules) {
    for (const selector of rule.selectors) {
      for (const hook of bareUiSlots(selector, owners)) {
        if (isDirectClientUiMechanism(hook, selector)) {
          directClientCounts.set(hook, (directClientCounts.get(hook) ?? 0) + 1);
          continue;
        }
        ctx.report(
          finding(
            CLIENT_GLOBALS,
            rule.line,
            hook,
            `client globals directly skins UI-only ${hook} without a client appearance/capability/shell carrier — put the component look in its @orb/ui tv() variant`,
          ),
        );
      }
    }
  }
}

function reportGeneratedWriters(census: StylesheetCensus, prefixes: ReadonlySet<string>, runtimeCounts: Map<string, number>, ctx: GateRunCtx): void {
  for (const rule of census.rules) {
    for (const declaration of rule.declarations) {
      if (!isGeneratedFamily(declaration.prop, prefixes)) {
        continue;
      }
      const writer = runtimeWriter(census.rel, rule.selectorList, declaration);
      if (writer !== undefined) {
        runtimeCounts.set(writer, (runtimeCounts.get(writer) ?? 0) + 1);
        continue;
      }
      ctx.report(
        finding(
          census.rel,
          declaration.line,
          declaration.prop,
          `${declaration.prop} mints or rewrites a generated token family outside theme.css without one of the closed runtime writer seams (density, reduced-transparency, colorization, local fade stops)`,
        ),
      );
    }
  }
}

function fullHomeSet(census: readonly StylesheetCensus[]): boolean {
  return census.length === PRODUCT_STYLESHEETS.length && PRODUCT_STYLESHEETS.every((rel) => census.some((row) => row.rel === rel));
}

function reportHomeCensus(row: StylesheetCensus, ctx: GateRunCtx): void {
  if (row.declarations === 0) {
    ctx.report(finding(row.rel, 0, "zero-declarations", `${row.rel} produced a zero declaration census — ownership verdict would be vacuous`));
  }
  const expected = EXPECTED_DECLARATION_CENSUS[row.rel];
  if (row.declarations !== expected) {
    ctx.report(
      finding(
        row.rel,
        1,
        CENSUS_TOKEN[row.rel],
        `${row.rel} contains ${row.declarations} declarations; the law-backed responsibility manifest expects ${expected}. An intentional ownership change updates this manifest in the same commit`,
      ),
    );
  }
}

function reportExactCensus(census: readonly StylesheetCensus[], total: number, ctx: GateRunCtx): void {
  if (!fullHomeSet(census)) {
    return;
  }
  for (const row of census) {
    reportHomeCensus(row, ctx);
  }
  if (total !== EXPECTED_DECLARATION_TOTAL) {
    ctx.report(
      finding(
        "tooling/src/verify/gates/css-family-ownership.ts",
        1,
        "census:total",
        `the five product stylesheets contain ${total} declarations; the exact responsibility manifest expects ${EXPECTED_DECLARATION_TOTAL}`,
      ),
    );
  }
}

function reportDirectThemeCensus(theme: StylesheetCensus | undefined, complete: boolean, ctx: GateRunCtx): readonly DirectDeclaration[] {
  const themeDirect = theme?.directTheme ?? [];
  if (theme !== undefined && themeDirect.length === 0) {
    ctx.report(
      finding(THEME, 0, "zero-theme-values", "the generated @theme block produced zero direct declarations — token-family ownership cannot be derived"),
    );
  }
  if (complete && themeDirect.length !== EXPECTED_DIRECT_THEME_DECLARATIONS) {
    ctx.report(
      finding(
        THEME,
        1,
        "census:theme-direct",
        `the generated @theme block contains ${themeDirect.length} direct declarations; the generated-output manifest expects ${EXPECTED_DIRECT_THEME_DECLARATIONS}`,
      ),
    );
  }
  return themeDirect;
}

function reportCensusHealth(census: readonly StylesheetCensus[], ctx: GateRunCtx): readonly DirectDeclaration[] {
  const total = census.reduce((sum, row) => sum + row.declarations, 0);
  const complete = fullHomeSet(census);
  ctx.scan({ unit: "declaration", candidates: total, scanned: total });
  reportExactCensus(census, total, ctx);
  return reportDirectThemeCensus(
    census.find((row) => row.rel === THEME),
    complete,
    ctx,
  );
}

function reportAuthoredLayers(row: StylesheetCensus, ctx: GateRunCtx): void {
  if (!(AUTHORED_STYLESHEETS as readonly string[]).includes(row.rel)) {
    return;
  }
  const blanked = blankCssComments(row.raw);
  for (const offset of actualLayerOffsets(row.raw)) {
    ctx.report(
      finding(
        row.rel,
        lineAt(blanked, offset),
        "@layer",
        "authored CSS contains an @layer block; the unlayered cascade is the mechanism and must remain global",
      ),
    );
  }
}

function reportDensityPlacement(row: StylesheetCensus, ctx: GateRunCtx): void {
  if (row.rel === TIERS) {
    return;
  }
  for (const rule of row.rules) {
    if (rule.selectorList.includes("[data-density")) {
      ctx.report(finding(row.rel, rule.line, "data-density", "density mapping belongs in tiers.css, never another sanctioned stylesheet"));
    }
    if (rule.selectorList.includes("[data-surface-tier")) {
      ctx.report(finding(row.rel, rule.line, "data-surface-tier", "surface-tier mapping belongs in tiers.css, never another sanctioned stylesheet"));
    }
    for (const declaration of rule.declarations) {
      if (declaration.prop.startsWith("--orb-tier-")) {
        ctx.report(finding(row.rel, declaration.line, declaration.prop, "private --orb-tier-* mapping belongs in tiers.css"));
      }
    }
  }
}

function reportShellRootRule(rule: StylesheetCensus["rules"][number], ctx: GateRunCtx): void {
  if (rule.selectorList !== ":root") {
    return;
  }
  for (const declaration of rule.declarations) {
    if (declaration.prop !== "view-transition-name" || declaration.value !== "none") {
      ctx.report(
        finding(
          SHELL,
          declaration.line,
          declaration.prop,
          "shell.css's document-root seam is only the exact view-transition-name:none reset; other document mechanisms belong in a global sheet",
        ),
      );
    }
  }
}

function reportHomeGrammar(row: StylesheetCensus, ctx: GateRunCtx): void {
  for (const rule of row.rules) {
    if (row.rel === SHELL) {
      reportShellRootRule(rule, ctx);
    }
    for (const selector of rule.selectors) {
      if (row.rel === TIERS && !isTierSelector(selector)) {
        ctx.report(finding(TIERS, rule.line, selector, "tiers.css contains a selector outside the closed density carrier/slot grammar"));
      } else if (row.rel === SHELL && !isShellSelector(selector)) {
        ctx.report(finding(SHELL, rule.line, selector, "shell.css contains a rule not rooted in shell structure, a view transition, or a keyframe step"));
      }
    }
  }
}

interface StylesheetAuditContext {
  readonly prefixes: ReadonlySet<string>;
  readonly owners: ReadonlyMap<string, HookOwners>;
  readonly runtimeCounts: Map<string, number>;
  readonly directClientCounts: Map<string, number>;
  readonly ctx: GateRunCtx;
}

function auditStylesheet(row: StylesheetCensus, audit: StylesheetAuditContext): void {
  const { prefixes, owners, runtimeCounts, directClientCounts, ctx } = audit;
  reportAuthoredLayers(row, ctx);
  reportDensityPlacement(row, ctx);
  reportDensityArmCompleteness(row, ctx);
  reportHomeGrammar(row, ctx);
  if (row.rel !== THEME) {
    reportGeneratedWriters(row, prefixes, runtimeCounts, ctx);
  }
  if (row.rel === UI_GLOBALS) {
    reportUiDependencyDirection(row, owners, ctx);
  } else if (row.rel === CLIENT_GLOBALS) {
    reportClientComponentSkins(row, owners, directClientCounts, ctx);
  }
}

function reportClosedSeamDrift(
  census: readonly StylesheetCensus[],
  runtimeCounts: ReadonlyMap<string, number>,
  directClientCounts: ReadonlyMap<string, number>,
  ctx: GateRunCtx,
): void {
  if (!(fullHomeSet(census) && existsSync(join(ctx.root, "package.json")))) {
    return;
  }
  for (const [writer, expected] of Object.entries(EXPECTED_RUNTIME_WRITERS)) {
    const actual = runtimeCounts.get(writer) ?? 0;
    if (actual !== expected) {
      ctx.report(
        finding(
          "tooling/src/verify/gates/css-family-ownership.ts",
          1,
          `runtime-writer:${writer}`,
          `runtime writer seam ${writer} matched ${actual}, expected ${expected}; either a sanctioned runtime mechanism moved or the executable exception is stale`,
        ),
      );
    }
  }
  for (const [hook, expected] of Object.entries(EXPECTED_DIRECT_CLIENT_UI_MECHANISMS)) {
    const actual = directClientCounts.get(hook) ?? 0;
    if (actual !== expected) {
      ctx.report(
        finding(
          "tooling/src/verify/gates/css-family-ownership.ts",
          1,
          `direct-client-mechanism:${hook}`,
          `direct client UI-mechanism seam ${hook} matched ${actual}, expected ${expected}; either the bounded recipe moved or this exception is stale`,
        ),
      );
    }
  }
}

function auditCssFamilies(ctx: GateRunCtx): void {
  const census = readCensus(ctx.root);
  const themeDirect = reportCensusHealth(census, ctx);
  const prefixes = themeFamilyPrefixes(themeDirect);
  const owners = collectHookOwners(ctx);
  const runtimeCounts = new Map<string, number>();
  const directClientCounts = new Map<string, number>();
  for (const row of census) {
    auditStylesheet(row, { prefixes, owners, runtimeCounts, directClientCounts, ctx });
  }
  reportClosedSeamDrift(census, runtimeCounts, directClientCounts, ctx);
}

interface CensusControlCounts {
  readonly themeDirect: number;
  readonly themeRules: number;
  readonly ui: number;
  readonly tiers: number;
  readonly client: number;
  readonly shell: number;
}

function controlDeclarations(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `  --${prefix}-${index}: 0;`).join("\n");
}

/** A complete five-home fixture with independently specified declaration counts. The controls below spell
 * the production baseline as literals instead of deriving their oracle from the gate's manifest. */
function censusControlFiles(counts: CensusControlCounts): Record<ProductStylesheet, string> {
  return {
    [THEME]:
      `@theme {\n${controlDeclarations("theme-probe", counts.themeDirect)}\n}\n` +
      `:root {\n${controlDeclarations("theme-rule-probe", counts.themeRules)}\n}\n`,
    [UI_GLOBALS]: `:root {\n${controlDeclarations("ui-probe", counts.ui)}\n}\n`,
    [TIERS]: `[data-surface-tier="base"] {\n${controlDeclarations("tier-probe", counts.tiers)}\n}\n`,
    [CLIENT_GLOBALS]: `:root {\n${controlDeclarations("client-probe", counts.client)}\n}\n`,
    [SHELL]: `.shell-grid {\n${controlDeclarations("shell-probe", counts.shell)}\n}\n`,
  };
}

export const gate: GateDescriptor = {
  name: "css-family-ownership",
  docRow: "client-architecture-lockdown.md §4.3 / §4.7 (#951)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: MESSAGE,
  fix: "move the declaration to its semantic home; do not relabel it, add an allowlist, change source order, or narrow theme/custom-CSS behavior",
  run: auditCssFamilies,
  mustFlag: [
    {
      files: { [UI_GLOBALS]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 1, token: "data-density" },
      why: "density planted in UI globals is routed to tiers.css",
    },
    {
      files: { [CLIENT_GLOBALS]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 1, token: "data-density" },
      why: "density planted in client globals is routed to tiers.css",
    },
    {
      files: { [SHELL]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 2, token: "data-density" },
      why: "density in shell violates both the density home and shell-root grammar",
    },
    {
      files: { [UI_GLOBALS]: "@layer base { :root { color-scheme: dark; } }\n" },
      expect: { count: 1, token: "@layer" },
      why: "an authored layer destroys the global unlayered-wins mechanism",
    },
    {
      files: {
        [THEME]: "@theme { --color-background: black; }\n",
        [SHELL]: ".shell-grid { --color-fresh-palette: oklch(0.5 0.1 40); }\n",
      },
      expect: { count: 1, token: "--color-fresh-palette" },
      why: "a new palette/value in shell is caught from the generated color namespace, even though the exact name is new",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-progress { overflow: hidden; }\n",
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="client-progress" />;\n',
      },
      expect: { count: 1, token: "class:client-progress" },
      why: "a class selected in UI globals but produced only by client source violates dependency direction",
    },
    {
      files: {
        [UI_GLOBALS]: '[data-slot="client-progress"] { overflow: hidden; }\n',
        "packages/client/src/features/probe.tsx": 'export const probe = <div data-slot="client-progress" />;\n',
      },
      expect: { count: 1, token: "slot:client-progress" },
      why: "the producer-direction arm covers JSX data-slot hooks, not only class strings",
    },
    {
      files: {
        [CLIENT_GLOBALS]: '[data-slot="button"] { border-radius: 1rem; }\n',
        "packages/ui/src/primitives/button.tsx": 'export const button = <button data-slot="button" />;\n',
      },
      expect: { count: 1, token: "slot:button" },
      why: "a bare client-global skin of a UI-only component belongs in the component tv() variant",
    },
    {
      files: { [TIERS]: ".button { padding: 1rem; }\n" },
      expect: { count: 1, token: ".button" },
      why: "a component skin planted in tiers.css is outside the density selector grammar",
    },
    {
      files: { [SHELL]: ".button { padding: 1rem; }\n" },
      expect: { count: 1, token: ".button" },
      why: "a component skin planted in shell.css is not rooted in the shell frame",
    },
    {
      files: { [SHELL]: ".shell-grid + .button { padding: 1rem; }\n" },
      expect: { count: 1, token: ".shell-grid + .button" },
      why: "a shell sibling does not root the subject painted after it",
    },
    {
      files: { [SHELL]: ".button:has(.shell-grid) { padding: 1rem; }\n" },
      expect: { count: 1, token: ".button:has(.shell-grid)" },
      why: "a shell descendant inside :has() does not make the outer component a shell subject",
    },
    {
      files: { [SHELL]: ":is(.shell-grid, .button) { padding: 1rem; }\n" },
      expect: { count: 1, token: ":is(.shell-grid, .button)" },
      why: "every :is() alternative used as the root must be shell-rooted",
    },
    {
      files: { [SHELL]: ":where(.shell-grid, .button) { padding: 1rem; }\n" },
      expect: { count: 1, token: ":where(.shell-grid, .button)" },
      why: "every :where() alternative used as the root must be shell-rooted",
    },
    {
      files: { [SHELL]: ".button:not(.shell-never), .shell-grid { padding: 1rem; }\n" },
      expect: { count: 1, token: ".button:not(.shell-never)" },
      why: "a negated shell class cannot launder one selector-list arm through a valid sibling arm",
    },
    {
      files: { [SHELL]: '[data-probe=".shell-grid"] .button { padding: 1rem; }\n' },
      expect: { count: 1, token: '[data-probe=".shell-grid"] .button' },
      why: "attribute value text that looks like a shell class is not a shell subject or ancestor",
    },
    {
      files: { [SHELL]: ':is([data-probe=".shell-grid"], .shell-panel) .button { padding: 1rem; }\n' },
      expect: { count: 1, token: ':is([data-probe=".shell-grid"], .shell-panel) .button' },
      why: "an attribute value cannot counterfeit the shell ancestry of one :is() branch",
    },
    {
      files: { [SHELL]: ':where([data-probe=".shell-grid"]) .button { padding: 1rem; }\n' },
      expect: { count: 1, token: ':where([data-probe=".shell-grid"]) .button' },
      why: "an attribute value cannot counterfeit shell ancestry inside :where()",
    },
    {
      files: censusControlFiles({ themeDirect: 179, themeRules: 96, ui: 188, tiers: 45, client: 111, shell: 335 }),
      expect: { count: 2, token: "census:ui-globals" },
      why: "adding one otherwise legal declaration makes both the UI-home and total ratchets stale",
    },
    {
      files: censusControlFiles({ themeDirect: 179, themeRules: 96, ui: 187, tiers: 45, client: 111, shell: 334 }),
      expect: { count: 2, token: "census:shell" },
      why: "deleting one otherwise legal declaration makes both the shell-home and total ratchets stale",
    },
    {
      files: censusControlFiles({ themeDirect: 179, themeRules: 96, ui: 186, tiers: 45, client: 112, shell: 335 }),
      expect: { count: 2, token: "census:ui-globals" },
      why: "moving one declaration preserves the total but makes both source and destination home ratchets stale",
    },
    {
      files: censusControlFiles({ themeDirect: 178, themeRules: 97, ui: 187, tiers: 45, client: 111, shell: 335 }),
      expect: { count: 1, token: "census:theme-direct" },
      why: "moving one generated declaration out of direct @theme keeps every home total stable but trips the generated-output ratchet",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-progress { overflow: hidden; }\n",
        "packages/ui/src/content/copy.ts": 'export const copy = "client-progress";\n',
        "packages/ui/src/lib/class-merge.ts": 'export function cn(...values: unknown[]): string { return String(values[0] ?? ""); }\n',
        "packages/client/src/features/probe.ts": 'import { cn } from "../../../ui/src/lib/class-merge.ts";\nexport const classes = cn("client-progress");\n',
      },
      expect: { count: 1, token: "class:client-progress" },
      why: "an inert UI prose string cannot launder a class produced only by a real client class-composer call",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-helper-class { overflow: hidden; }\n",
        "packages/ui/src/helpers/probe.ts":
          'const helper = { cn: (...values: string[]) => values.join(" ") };\nexport const classes = helper.cn("client-helper-class");\n',
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="client-helper-class" />;\n',
      },
      expect: { count: 1, token: "class:client-helper-class" },
      why: "an unrelated helper.cn call is not provenance for an @orb/ui class producer",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-direct-name { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nelement.className = "client-direct-name";\n',
      },
      expect: { count: 1, token: "class:client-direct-name" },
      why: "direct className assignment is a live client class producer",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-computed-name { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nelement["className"] = "client-computed-name";\n',
      },
      expect: { count: 1, token: "class:client-computed-name" },
      why: "computed className assignment is a live client class producer",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-bracket-add { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts": 'declare const element: HTMLElement;\nelement.classList["add"]("client-bracket-add");\n',
      },
      expect: { count: 1, token: "class:client-bracket-add" },
      why: "bracketed DOMTokenList mutation is a live client class producer",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-optional-toggle { overflow: hidden; }\n",
        "packages/client/src/features/probe.ts":
          'declare const element: HTMLElement | undefined;\nelement?.["classList"]?.["toggle"]?.("client-optional-toggle");\n',
      },
      expect: { count: 1, token: "class:client-optional-toggle" },
      why: "optional computed DOMTokenList mutation is a live client class producer",
    },
    {
      files: { [SHELL]: ":root { color-scheme: dark; }\n" },
      expect: { count: 1, token: "color-scheme" },
      why: "the one document-root declaration in shell is the view-transition reset, not a general global-mechanism door",
    },
    {
      files: { [TIERS]: '[data-density="compact"] { --spacing-field: 0.25rem; --spacing-row: 0.375rem; --spacing-block: 0.5rem; --spacing-section: 1rem; }\n' },
      expect: { count: 1, token: 'density-arm:[data-density="comfortable"]' },
      why: "one density arm without its symmetric counterpart is a stale runtime contract, not a valid partial map",
    },
  ],
  mustPass: [
    {
      files: { [THEME]: "@theme { --color-background: black; --spacing-row: 0.5rem; }\n:root { color-scheme: dark; }\n" },
      why: "generated @theme declarations are counted as declarations and define the live generated namespaces",
    },
    {
      files: {
        [THEME]: "@theme {\n  --color-background: black;\n  @media (forced-colors: active) {\n    --probe-nested: white;\n  }\n}\n",
        [SHELL]: ".shell-grid { --probe-runtime: white; }\n",
      },
      why: "only direct @theme declarations mint generated namespaces; a nested declaration cannot widen the writer wall",
    },
    {
      files: {
        [TIERS]:
          '[data-density="comfortable"] { --spacing-field: var(--orb-density-comfortable-field); --spacing-row: var(--orb-density-comfortable-row); --spacing-block: var(--orb-density-comfortable-block); --spacing-section: var(--orb-density-comfortable-section); }\n' +
          '[data-density="compact"] { --spacing-field: var(--orb-density-compact-field); --spacing-row: var(--orb-density-compact-row); --spacing-block: var(--orb-density-compact-block); --spacing-section: var(--orb-density-compact-section); }\n',
      },
      why: "both symmetric density runtime writers belong in tiers.css and each maps all four intents",
    },
    {
      files: {
        [UI_GLOBALS]: ".scroll-fade-x { --fade-start-stop: 0%; }\n",
        "packages/ui/src/lib/scroll.ts": 'export const SCROLL_FADE_X_CLASS = "scroll-fade-x";\n',
        "packages/ui/src/lib/index.ts": 'export { SCROLL_FADE_X_CLASS } from "./scroll.ts";\n',
        "packages/client/src/feature.tsx":
          'import { SCROLL_FADE_X_CLASS } from "../../ui/src/lib/index.ts";\nexport const probe = <div className={SCROLL_FADE_X_CLASS} />;\n',
      },
      why: "a live client className imported through the UI public barrel proves both producer directions without admitting an inert literal",
    },
    {
      files: {
        [CLIENT_GLOBALS]: 'html[data-blur-modals] [data-slot="dialog-popup"] { backdrop-filter: blur(1rem); }\n',
        "packages/ui/src/primitives/dialog.tsx": 'export const dialog = <div data-slot="dialog-popup" />;\n',
      },
      why: "a client appearance carrier may treat a UI primitive without becoming its component skin",
    },
    {
      files: { [SHELL]: ".shell-grid { display: grid; --rail-w: 3rem; }\n:root { view-transition-name: none; }\n" },
      why: "shell-rooted geometry and the exact view-transition reset remain in the shell home",
    },
    {
      files: {
        [SHELL]:
          ".shell-grid > .button { padding: 1rem; }\n" +
          ".shell-grid .button { margin: 0; }\n" +
          ":is(.shell-grid, .shell-panel) .button { display: block; }\n" +
          '.shell-grid:where([data-elevation="ramp"]) .button { color: inherit; }\n',
      },
      why: "shell subjects and ancestors remain valid through child/descendant combinators and all-shell :is() alternatives",
    },
    {
      files: {
        [UI_GLOBALS]:
          ".shared-cn { overflow: hidden; }\n.shared-tv { display: block; }\n.shared-namespace-cn { opacity: 1; }\n.shared-wrapper { visibility: visible; }\n",
        "packages/ui/src/lib/class-merge.ts":
          'export function cn(...values: unknown[]): string { return String(values[0] ?? ""); }\n' +
          "export const tv = (config: unknown): unknown => config;\n",
        "packages/ui/src/lib/index.ts": 'export { cn as mergeClasses, tv as defineVariant } from "./class-merge.ts";\n',
        "packages/ui/src/components/probe.ts":
          'import { defineVariant, mergeClasses } from "../lib/index.ts";\n' +
          'import * as styles from "../lib/index.ts";\n' +
          'export const sharedClass = mergeClasses("shared-cn");\n' +
          'export const sharedVariant = defineVariant({ base: "shared-tv" });\n' +
          'export const sharedNamespace = styles["mergeClasses"]("shared-namespace-cn");\n' +
          "const wrapped = (...values: unknown[]): string => mergeClasses(...values);\n" +
          'export const sharedWrapper = wrapped("shared-wrapper");\n',
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="shared-cn shared-tv shared-namespace-cn shared-wrapper" />;\n',
      },
      why: "canonical @orb/ui cn/tv producers remain UI-owned through a barrel, named aliases, namespace-computed access, and a forwarding wrapper",
    },
    {
      files: censusControlFiles({ themeDirect: 179, themeRules: 96, ui: 187, tiers: 45, client: 111, shell: 335 }),
      why: "the exact post-#938 declaration manifest, including direct generated @theme declarations, is the clean control",
    },
    {
      files: { [UI_GLOBALS]: "/* @layer base { .fake { color: red; } } */\n:root { font-size: 100%; }\n" },
      why: "comment text cannot manufacture an authored-layer finding",
    },
  ],
};
