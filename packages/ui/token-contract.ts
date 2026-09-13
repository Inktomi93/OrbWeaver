// Stable DTCG 2025.10 is the token VAULT contract; Style Dictionary is only the emitter. The official
// schemas are vendored and hash-pinned here, then Orb adds the semantic checks JSON Schema cannot express:
// inherited types, terminal aliases, closed extensions/output roles, bounded Resolver composition, and
// removed-token review. Runtime CSS remains concrete data in `orb.cssValues`, never a private token type.
//
// NOT SHIPPED, and deliberately absent from the package `exports` map (#1847): this module is node-only
// (`node:child_process`/`node:fs`) and validates through `ajv`, an @orb/ui devDependency — it is build/
// verify machinery, the twin of its package-root neighbours tokens.build.ts and tokens.near-duplicate.ts,
// neither of which carries a subpath either. An `exports` entry is a PRODUCTION-surface declaration, and
// `knip --production` reads it as one: with `./token-contract` present, ajv/ajv-formats were reported as
// unlisted production dependencies of a browser package. Its two cross-package readers (the
// `tokens-contract` gate and tests/tooling) import it by relative path — tools sit above the cake and read
// down; the module cannot re-home into tooling while tokens.build.ts consumes it (`packages-no-tooling`).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ErrorObject, ValidateFunction } from "ajv";
import { Ajv } from "ajv";
// biome-ignore lint/performance/noNamespaceImport: ajv-formats is CommonJS; this module is compiled under both Bundler and NodeNext resolution.
import * as addFormatsModule from "ajv-formats";
import { z } from "zod";

// PROVENANCE of the two vendored schemas the hashes below pin — DTCG version 2025.10, fetched from
// `https://www.designtokens.org/schemas/2025.10/{format,resolver}.json`. Stated as a comment, not as three
// `DTCG_VERSION`/`*_SCHEMA_SOURCE` constants: nothing read them (#1847), and a constant no code reads is a
// value that can drift away from the bytes it claims to describe without anything noticing. The VERSION is
// load-bearing in exactly two places that DO check — the vendored filenames under `src/tokens/schemas/` and
// the `$schema` each token file declares — and re-spelling it here bought neither of them a guarantee.
export const FORMAT_SCHEMA_SHA256 = "02d3362a3127834fd2fdd4e4d86748eaa4623054fabf369db8a410526b12646f";
export const RESOLVER_SCHEMA_SHA256 = "2286caca56d683066475b93bca78fd73a9a337f20981bf98ea8ee8d60f8fd40b";
const TOKEN_REMOVAL_BASE_REF = "origin/main";
export const REQUIRED_SEED_VALUE_SET_PATHS: readonly string[] = Object.freeze([
  "color.primary",
  "color.ring",
  "color.primary-foreground",
  "color.user-bubble",
  "color.user-bubble-foreground",
  "color.ai-bubble",
  "color.ai-bubble-foreground",
  "color.system-bubble",
  "color.system-bubble-foreground",
  "color.speaker",
  "color.dialogue",
  "color.narration",
  "color.prose-body",
  "color.background",
  "color.sidebar",
  "color.surface-raised",
  "color.card",
  "color.popover",
  "color.accent",
  "color.accent-foreground",
  "color.sidebar-accent",
  "color.sidebar-accent-foreground",
  "color.secondary",
  "color.secondary-foreground",
  "color.muted",
  "color.reading-plate",
  "color.reading-plate-foreground",
  "color.reading-band",
  "color.foreground",
  "color.card-foreground",
  "color.popover-foreground",
  "color.sidebar-foreground",
  "color.muted-foreground",
  "color.border",
  "color.sidebar-border",
  "color.input",
  "color.shadow-hairline",
  "color.shadow-highlight",
  "color.shadow-ambient-near",
  "color.shadow-ambient-far",
  "color.shadow-cta-highlight",
  // Backdrop is palette-specific dimming smoke, but is not derived by a custom ThemeScope.
  "color.backdrop",
]);

const TOKEN_FILES = {
  base: "src/tokens/tokens.json",
  light: "src/tokens/themes/light.json",
  mocha: "src/tokens/themes/mocha.json",
  resolver: "src/tokens/resolver.json",
  removed: "src/tokens/removed.json",
  formatSchema: "src/tokens/schemas/format-2025.10.schema.json",
  resolverSchema: "src/tokens/schemas/resolver-2025.10.schema.json",
} as const;

const TOKEN_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "cubicBezier",
  "number",
  "strokeStyle",
  "border",
  "transition",
  "shadow",
  "gradient",
  "typography",
] as const;
const TOKEN_TYPE_SET: ReadonlySet<string> = new Set(TOKEN_TYPES);
const TOKEN_REPO_PATH = "packages/ui/src/tokens/tokens.json";
const ALIAS_RE = /^\{([^{}]+)\}$/u;
const CSS_VAR_RE = /var\((--[a-z0-9-]+)(?:\s*,[^)]*)?\)/gu;

type JsonObject = Record<string, unknown>;
type AddFormats = (ajv: Ajv) => Ajv;
type TokenType = (typeof TOKEN_TYPES)[number];
type OutputRole = "input" | "light-dark" | "percentage" | "snapped";
export type CssValuePlacement = "theme" | "root";

interface TokenContractDiagnostic {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export interface ContractToken {
  readonly path: readonly string[];
  readonly pathString: string;
  readonly node: JsonObject;
  readonly type: TokenType | null;
  readonly value: unknown;
  readonly outputRole: OutputRole | null;
}

interface CssValueEntry {
  readonly value: string;
  readonly placement: CssValuePlacement;
  readonly description: string;
  readonly provenance: readonly string[];
}

interface ThemeSet {
  readonly id: "hearth" | "light" | "mocha";
  readonly colorScheme: "light" | "dark";
  readonly source: "base" | "light" | "mocha";
}

export interface TokenContractResult {
  readonly diagnostics: readonly TokenContractDiagnostic[];
  readonly scannedTokens: number;
  readonly baseTokens: readonly ContractToken[];
  readonly lightTokens: ReadonlyMap<string, ContractToken>;
  readonly mochaTokens: ReadonlyMap<string, ContractToken>;
  readonly cssValues: Readonly<Record<string, CssValueEntry>>;
  readonly cssTargets: ReadonlySet<string>;
  readonly themes: readonly ThemeSet[];
}

export interface TokenContractTexts {
  readonly base: string;
  readonly light: string;
  readonly mocha: string;
  readonly resolver: string;
  readonly removed: string;
  readonly formatSchema: string;
  readonly resolverSchema: string;
}

const dimensionSchema = z.object({ value: z.number(), unit: z.enum(["px", "rem"]) }).strict();
const pointerFineSchema = dimensionSchema;
const outputSchema = z.object({ kind: z.enum(["input", "light-dark", "percentage", "snapped"]) }).strict();
const llmSchema = z
  .object({ usage: z.array(z.string().min(1)).min(1).optional(), rules: z.string().min(1).optional() })
  .strict()
  .refine((value) => value.usage !== undefined || value.rules !== undefined, "usage or rules is required");
const cssValueEntrySchema = z
  .object({
    value: z.string().min(1),
    placement: z.enum(["theme", "root"]),
    description: z.string().min(1),
    provenance: z.array(z.string().min(1)).min(1),
  })
  .strict();
const cssValuesSchema = z.record(z.string().regex(/^--[a-z0-9-]+$/u), cssValueEntrySchema);
const themeMetaSchema = z.object({ id: z.enum(["hearth", "light", "mocha"]), colorScheme: z.enum(["light", "dark"]) }).strict();
const removedSchema = z
  .object({
    removed: z.array(z.object({ path: z.string().min(1), reason: z.string().min(1), replacement: z.string().min(1).optional() }).strict()),
    removedTargets: z.array(
      z.object({ target: z.string().regex(/^--[a-z0-9-]+$/u), reason: z.string().min(1), replacement: z.string().min(1).optional() }).strict(),
    ),
  })
  .strict();

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diagnostic(path: string, code: string, message: string): TokenContractDiagnostic {
  return { path, code, message };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseJson(text: string, path: string, diagnostics: TokenContractDiagnostic[]): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    diagnostics.push(diagnostic(path, "json.parse", error instanceof Error ? error.message : String(error)));
    return null;
  }
}

function zodDiagnostics(path: string, code: string, result: z.ZodSafeParseResult<unknown>): TokenContractDiagnostic[] {
  if (!("error" in result)) {
    return [];
  }
  return result.error.issues.map((issue) => diagnostic(`${path}${issue.path.length > 0 ? `/${issue.path.join("/")}` : ""}`, code, issue.message));
}

function ajvDiagnostics(path: string, code: string, validate: ValidateFunction, value: unknown): TokenContractDiagnostic[] {
  if (validate(value)) {
    return [];
  }
  return (validate.errors ?? []).map((error: ErrorObject) =>
    diagnostic(`${path}${error.instancePath}`, code, `${error.message ?? "schema violation"}${error.params ? ` (${JSON.stringify(error.params)})` : ""}`),
  );
}

function compileSchema(schema: unknown): ValidateFunction {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const formatsExport = addFormatsModule.default as AddFormats | { default: AddFormats };
  const addFormats = typeof formatsExport === "function" ? formatsExport : formatsExport.default;
  addFormats(ajv);
  return ajv.compile(schema as object);
}

function tokenType(value: unknown): TokenType | null {
  return typeof value === "string" && TOKEN_TYPE_SET.has(value) ? (value as TokenType) : null;
}

function outputRole(node: JsonObject, path: string, diagnostics: TokenContractDiagnostic[]): OutputRole | null {
  const extensions = node["$extensions"];
  if (!isObject(extensions) || extensions["orb.output"] === undefined) {
    return null;
  }
  const parsed = outputSchema.safeParse(extensions["orb.output"]);
  diagnostics.push(...zodDiagnostics(`${path}/$extensions/orb.output`, "orb.output", parsed));
  return parsed.success ? parsed.data.kind : null;
}

function validateOrbExtensionNames(extensions: JsonObject, allowed: ReadonlySet<string>, path: string, diagnostics: TokenContractDiagnostic[]): void {
  for (const key of Object.keys(extensions)) {
    if (key.startsWith("orb.") && !allowed.has(key)) {
      diagnostics.push(diagnostic(`${path}/${key}`, "orb.extension.unknown", `unknown Orb extension ${JSON.stringify(key)}`));
    }
  }
}

interface TokenCollector {
  readonly diagnostics: TokenContractDiagnostic[];
  readonly tokens: ContractToken[];
}

function effectiveTokenType(
  node: JsonObject,
  path: readonly string[],
  inheritedType: TokenType | null,
  diagnostics: TokenContractDiagnostic[],
): TokenType | null {
  const declared = node["$type"];
  const ownType = tokenType(declared);
  if (declared !== undefined && ownType === null) {
    diagnostics.push(diagnostic(`/${path.join("/")}/$type`, "token.type.unknown", `unknown token type ${JSON.stringify(declared)}`));
  }
  return ownType ?? inheritedType;
}

function collectTokenNode(node: JsonObject, path: readonly string[], effectiveType: TokenType | null, collector: TokenCollector): void {
  const pathString = path.join(".");
  const jsonPath = `/${path.join("/")}`;
  const extensions = node["$extensions"];
  if (isObject(extensions)) {
    validateOrbExtensionNames(extensions, new Set(["orb.pointerFine", "orb.output"]), `${jsonPath}/$extensions`, collector.diagnostics);
  }
  const role = outputRole(node, jsonPath, collector.diagnostics);
  if (effectiveType === null) {
    collector.diagnostics.push(diagnostic(jsonPath, "token.type.missing", "token has no declared or inherited standard $type"));
  }
  if (isObject(extensions) && extensions["orb.pointerFine"] !== undefined) {
    collector.diagnostics.push(
      ...zodDiagnostics(`${jsonPath}/$extensions/orb.pointerFine`, "orb.pointerFine", pointerFineSchema.safeParse(extensions["orb.pointerFine"])),
    );
    if (effectiveType !== "dimension") {
      collector.diagnostics.push(diagnostic(jsonPath, "orb.pointerFine.type", "orb.pointerFine is valid only on a dimension token"));
    }
  }
  if (role === "snapped" && effectiveType !== "dimension") {
    collector.diagnostics.push(diagnostic(jsonPath, "orb.output.type", "snapped output requires a dimension token"));
  }
  if (role === "percentage" && effectiveType !== "number") {
    collector.diagnostics.push(diagnostic(jsonPath, "orb.output.type", "percentage output requires a number token"));
  }
  if (role === "light-dark" && effectiveType !== "color") {
    collector.diagnostics.push(diagnostic(jsonPath, "orb.output.type", "light-dark output requires a color token"));
  }
  collector.tokens.push({ path, pathString, node, type: effectiveType, value: node["$value"] ?? node["$ref"], outputRole: role });
}

function collectTokens(node: JsonObject, path: readonly string[], inheritedType: TokenType | null, collector: TokenCollector): void {
  const effectiveType = effectiveTokenType(node, path, inheritedType, collector.diagnostics);
  if ("$value" in node || "$ref" in node) {
    collectTokenNode(node, path, effectiveType, collector);
    return;
  }
  const extensions = node["$extensions"];
  if (path.length > 0 && isObject(extensions)) {
    validateOrbExtensionNames(extensions, new Set(), `/${path.join("/")}/$extensions`, collector.diagnostics);
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$") || !isObject(child)) {
      continue;
    }
    collectTokens(child, [...path, key], effectiveType, collector);
  }
}

function aliasTarget(token: ContractToken): string | null {
  if (typeof token.node["$ref"] === "string") {
    const ref = token.node["$ref"];
    if (!ref.startsWith("#/")) {
      return null;
    }
    const parts = ref
      .slice(2)
      .split("/")
      .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
      .filter((part) => part !== "$value");
    return parts.join(".");
  }
  if (typeof token.value !== "string") {
    return null;
  }
  return ALIAS_RE.exec(token.value)?.[1] ?? null;
}

function validateAliases(tokens: readonly ContractToken[], diagnostics: TokenContractDiagnostic[]): void {
  const byPath = new Map(tokens.map((token) => [token.pathString, token]));
  const resolve = (token: ContractToken, chain: readonly string[]): ContractToken | null => {
    const targetPath = aliasTarget(token);
    if (targetPath === null) {
      return token;
    }
    if (chain.includes(targetPath)) {
      diagnostics.push(diagnostic(`/${token.path.join("/")}/$value`, "alias.cycle", `alias cycle: ${[...chain, targetPath].join(" -> ")}`));
      return null;
    }
    const target = byPath.get(targetPath);
    if (target === undefined) {
      diagnostics.push(diagnostic(`/${token.path.join("/")}/$value`, "alias.missing", `alias target ${JSON.stringify(targetPath)} does not exist`));
      return null;
    }
    return resolve(target, [...chain, targetPath]);
  };
  for (const token of tokens) {
    if (aliasTarget(token) === null) {
      continue;
    }
    const terminal = resolve(token, [token.pathString]);
    if (terminal !== null && token.type !== terminal.type) {
      diagnostics.push(
        diagnostic(
          `/${token.path.join("/")}/$value`,
          "alias.type",
          `alias type ${token.type ?? "missing"} does not match terminal ${terminal.pathString} type ${terminal.type ?? "missing"}`,
        ),
      );
    }
  }
}

function validateFonts(tokens: readonly ContractToken[], diagnostics: TokenContractDiagnostic[]): void {
  for (const token of tokens) {
    if (token.type !== "fontFamily" || aliasTarget(token) !== null) {
      continue;
    }
    const members = Array.isArray(token.value) ? token.value : [token.value];
    for (const [index, member] of members.entries()) {
      if (typeof member === "string" && member.includes(",")) {
        diagnostics.push(diagnostic(`/${token.path.join("/")}/$value/${index}`, "fontFamily.member", "each fontFamily member must name exactly one family"));
      }
    }
  }
}

function validateInheritedValues(tokens: readonly ContractToken[], formatValidate: ValidateFunction, diagnostics: TokenContractDiagnostic[]): void {
  for (const token of tokens) {
    if (token.type === null || token.node["$type"] !== undefined) {
      continue;
    }
    const explicit = { token: { ...token.node, $type: token.type } };
    const inheritedDiagnostics = ajvDiagnostics(`/${token.path.join("/")}`, "format.inherited", formatValidate, explicit);
    diagnostics.push(...inheritedDiagnostics);
  }
}

function parseRootExtensions(base: JsonObject, tokenPaths: ReadonlySet<string>, diagnostics: TokenContractDiagnostic[]): Record<string, CssValueEntry> {
  const extensions = base["$extensions"];
  if (!isObject(extensions)) {
    diagnostics.push(diagnostic("/$extensions", "orb.extensions.missing", "root $extensions must declare orb.llm and orb.cssValues"));
    return {};
  }
  validateOrbExtensionNames(extensions, new Set(["orb.llm", "orb.cssValues"]), "/$extensions", diagnostics);
  const llm = llmSchema.safeParse(extensions["orb.llm"]);
  diagnostics.push(...zodDiagnostics("/$extensions/orb.llm", "orb.llm", llm));
  const cssValues = cssValuesSchema.safeParse(extensions["orb.cssValues"]);
  diagnostics.push(...zodDiagnostics("/$extensions/orb.cssValues", "orb.cssValues", cssValues));
  if (!cssValues.success) {
    return {};
  }
  for (const [target, entry] of Object.entries(cssValues.data)) {
    for (const provenance of entry.provenance) {
      if (!tokenPaths.has(provenance)) {
        diagnostics.push(
          diagnostic(
            `/$extensions/orb.cssValues/${target}/provenance`,
            "orb.cssValues.provenance",
            `provenance token ${JSON.stringify(provenance)} does not exist`,
          ),
        );
      }
    }
  }
  return cssValues.data;
}

function cssVarFor(token: ContractToken): string {
  return `--${token.path.join("-")}`;
}

function validateOutputTargets(
  baseTokens: readonly ContractToken[],
  lightTokens: ReadonlyMap<string, ContractToken>,
  cssValues: Readonly<Record<string, CssValueEntry>>,
  diagnostics: TokenContractDiagnostic[],
): ReadonlySet<string> {
  const targets = new Set<string>();
  const baseByPath = new Map(baseTokens.map((token) => [token.pathString, token]));
  for (const token of baseTokens) {
    if (token.outputRole === "input") {
      continue;
    }
    const target = cssVarFor(token);
    if (targets.has(target)) {
      diagnostics.push(diagnostic(`/${token.path.join("/")}`, "output.duplicate", `duplicate generated target ${target}`));
    }
    targets.add(target);
    if (token.outputRole === "light-dark" && !lightTokens.has(token.pathString)) {
      diagnostics.push(diagnostic(`/${token.path.join("/")}`, "output.light-dark.missing", "light-dark output has no matching Light value-set token"));
    }
  }
  for (const target of Object.keys(cssValues)) {
    if (targets.has(target)) {
      diagnostics.push(diagnostic(`/$extensions/orb.cssValues/${target}`, "output.duplicate", `target ${target} is also emitted by a portable token`));
    }
    targets.add(target);
  }
  validateCssValueOperands(cssValues, targets, baseByPath, diagnostics);
  return targets;
}

function validateCssValueOperands(
  cssValues: Readonly<Record<string, CssValueEntry>>,
  targets: ReadonlySet<string>,
  baseByPath: ReadonlyMap<string, ContractToken>,
  diagnostics: TokenContractDiagnostic[],
): void {
  for (const [target, entry] of Object.entries(cssValues)) {
    const alias = ALIAS_RE.exec(entry.value)?.[1];
    if (alias !== undefined) {
      const source = baseByPath.get(alias);
      if (source === undefined) {
        diagnostics.push(
          diagnostic(
            `/$extensions/orb.cssValues/${target}/value`,
            "orb.cssValues.alias.missing",
            `portable-token alias ${JSON.stringify(alias)} does not exist`,
          ),
        );
      } else if (source.outputRole === "input") {
        diagnostics.push(
          diagnostic(
            `/$extensions/orb.cssValues/${target}/value`,
            "orb.cssValues.alias.nonportable",
            `portable-token alias ${JSON.stringify(alias)} names an input-only token with no CSS output`,
          ),
        );
      }
      continue;
    }
    for (const match of entry.value.matchAll(CSS_VAR_RE)) {
      const operand = match[1];
      if (operand === undefined || targets.has(operand)) {
        continue;
      }
      diagnostics.push(
        diagnostic(`/$extensions/orb.cssValues/${target}/value`, "orb.cssValues.var", `custom-property operand ${operand} is not a generated target`),
      );
    }
  }
}

function asTokenMap(tokens: readonly ContractToken[]): ReadonlyMap<string, ContractToken> {
  return new Map(tokens.map((token) => [token.pathString, token]));
}

interface SeedValidationContext {
  readonly name: string;
  readonly tokens: readonly ContractToken[];
  readonly basePaths: ReadonlySet<string>;
  readonly requiredPaths: ReadonlySet<string>;
  readonly diagnostics: TokenContractDiagnostic[];
}

function validateSeedTokens(context: SeedValidationContext): void {
  const { name, tokens, basePaths, requiredPaths, diagnostics } = context;
  const presentPaths = new Set(tokens.map((token) => token.pathString));
  const missing = [...requiredPaths].filter((path) => !presentPaths.has(path));
  const extra = [...presentPaths].filter((path) => !requiredPaths.has(path));
  if (missing.length > 0 || extra.length > 0) {
    diagnostics.push(
      diagnostic(
        "/",
        "seed.members",
        `${name} value-set must contain its exact required token set — missing [${missing.join(", ")}], extra [${extra.join(", ")}]`,
      ),
    );
  }
  for (const token of tokens) {
    if (token.type !== "color") {
      diagnostics.push(diagnostic(`/${token.path.join("/")}`, "seed.type", `${name} value-set token must inherit or declare color`));
    }
    if (!basePaths.has(token.pathString)) {
      diagnostics.push(diagnostic(`/${token.path.join("/")}`, "seed.extra", `${name} value-set path is absent from the base token vault`));
    }
  }
}

function refValue(value: unknown): string | null {
  return isObject(value) && typeof value["$ref"] === "string" ? value["$ref"] : null;
}

const EXPECTED_THEME_META = {
  base: { id: "hearth", colorScheme: "dark" },
  light: { id: "light", colorScheme: "light" },
  mocha: { id: "mocha", colorScheme: "dark" },
} as const;

function validateThemeMeta(source: keyof typeof EXPECTED_THEME_META, extensions: JsonObject, diagnostics: TokenContractDiagnostic[]): ThemeSet | null {
  const meta = themeMetaSchema.safeParse(extensions["orb.theme"]);
  diagnostics.push(...zodDiagnostics(`/sets/${source}/$extensions/orb.theme`, "orb.theme", meta));
  if (!meta.success) {
    return null;
  }
  const expected = EXPECTED_THEME_META[source];
  if (meta.data.id !== expected.id || meta.data.colorScheme !== expected.colorScheme) {
    diagnostics.push(
      diagnostic(
        `/sets/${source}/$extensions/orb.theme`,
        "resolver.theme",
        `set ${source} must identify seed ${expected.id} with ${expected.colorScheme} color-scheme`,
      ),
    );
  }
  return { ...meta.data, source };
}

function validateResolverSets(sets: JsonObject, diagnostics: TokenContractDiagnostic[]): readonly ThemeSet[] {
  const expectedSets = ["base", "light", "mocha"] as const;
  const expectedSetRefs = { base: "./tokens.json", light: "./themes/light.json", mocha: "./themes/mocha.json" } as const;
  const themes: ThemeSet[] = [];
  if (JSON.stringify(Object.keys(sets).sort()) !== JSON.stringify([...expectedSets].sort())) {
    diagnostics.push(diagnostic("/sets", "resolver.sets", "bounded Resolver supports exactly base, light, and mocha sets"));
  }
  for (const key of expectedSets) {
    const set = sets[key];
    if (!isObject(set)) {
      continue;
    }
    const sources = Array.isArray(set["sources"]) ? set["sources"] : [];
    if (sources.length !== 1 || refValue(sources[0]) !== expectedSetRefs[key]) {
      diagnostics.push(diagnostic(`/sets/${key}/sources`, "resolver.source", `set ${key} must reference only ${expectedSetRefs[key]}`));
    }
    const extensions = isObject(set["$extensions"]) ? set["$extensions"] : {};
    validateOrbExtensionNames(extensions, new Set(["orb.theme"]), `/sets/${key}/$extensions`, diagnostics);
    const theme = validateThemeMeta(key, extensions, diagnostics);
    if (theme !== null) {
      themes.push(theme);
    }
  }
  return themes;
}

function validateThemeModifier(modifiers: JsonObject, diagnostics: TokenContractDiagnostic[]): void {
  if (JSON.stringify(Object.keys(modifiers)) !== JSON.stringify(["theme"])) {
    diagnostics.push(diagnostic("/modifiers", "resolver.modifiers", "bounded Resolver supports exactly one theme modifier"));
  }
  const modifier = isObject(modifiers["theme"]) ? modifiers["theme"] : {};
  const contexts = isObject(modifier["contexts"]) ? modifier["contexts"] : {};
  const expectedContexts: Readonly<Record<string, string | null>> = { hearth: null, light: "#/sets/light", mocha: "#/sets/mocha" };
  if (modifier["default"] !== "hearth") {
    diagnostics.push(diagnostic("/modifiers/theme/default", "resolver.default", "theme modifier default must be hearth"));
  }
  if (JSON.stringify(Object.keys(contexts).sort()) !== JSON.stringify(Object.keys(expectedContexts).sort())) {
    diagnostics.push(diagnostic("/modifiers/theme/contexts", "resolver.contexts", "theme contexts must be exactly hearth, light, and mocha"));
  }
  for (const [context, expectedRef] of Object.entries(expectedContexts)) {
    const sources = Array.isArray(contexts[context]) ? contexts[context] : [];
    const valid = expectedRef === null ? sources.length === 0 : sources.length === 1 && refValue(sources[0]) === expectedRef;
    if (!valid) {
      diagnostics.push(diagnostic(`/modifiers/theme/contexts/${context}`, "resolver.context", `unsupported source order for ${context}`));
    }
  }
}

function validateResolverSubset(resolver: JsonObject, diagnostics: TokenContractDiagnostic[]): readonly ThemeSet[] {
  const sets = isObject(resolver["sets"]) ? resolver["sets"] : {};
  const modifiers = isObject(resolver["modifiers"]) ? resolver["modifiers"] : {};
  const themes = validateResolverSets(sets, diagnostics);
  validateThemeModifier(modifiers, diagnostics);
  const order = Array.isArray(resolver["resolutionOrder"]) ? resolver["resolutionOrder"] : [];
  const orderRefs = order.map(refValue);
  if (JSON.stringify(orderRefs) !== JSON.stringify(["#/sets/base", "#/modifiers/theme"])) {
    diagnostics.push(diagnostic("/resolutionOrder", "resolver.order", "resolutionOrder must be base, then theme modifier"));
  }
  return themes;
}

function tokenPathsFromLegacy(value: unknown): ReadonlySet<string> {
  if (!isObject(value)) {
    return new Set();
  }
  const tokens: ContractToken[] = [];
  collectTokens(value, [], null, { diagnostics: [], tokens });
  return new Set(tokens.map((token) => token.pathString));
}

interface RemovedLedger {
  readonly paths: ReadonlySet<string>;
  readonly targets: ReadonlySet<string>;
}

function tokenTargetsFromLegacy(value: unknown): ReadonlySet<string> {
  if (!isObject(value)) {
    return new Set();
  }
  const tokens: ContractToken[] = [];
  collectTokens(value, [], null, { diagnostics: [], tokens });
  const targets = new Set(tokens.filter((token) => token.outputRole !== "input").map(cssVarFor));
  const extensions = value["$extensions"];
  const cssValues = isObject(extensions) ? extensions["orb.cssValues"] : undefined;
  if (isObject(cssValues)) {
    for (const target of Object.keys(cssValues)) {
      if (/^--[a-z0-9-]+$/u.test(target)) {
        targets.add(target);
      }
    }
  }
  return targets;
}

function validateRemovedLedger(
  removed: unknown,
  currentPaths: ReadonlySet<string>,
  currentTargets: ReadonlySet<string>,
  diagnostics: TokenContractDiagnostic[],
): RemovedLedger {
  const parsed = removedSchema.safeParse(removed);
  diagnostics.push(...zodDiagnostics("/removed", "removed.schema", parsed));
  if (!parsed.success) {
    return { paths: new Set(), targets: new Set() };
  }
  const paths = new Set<string>();
  for (const entry of parsed.data.removed) {
    if (paths.has(entry.path)) {
      diagnostics.push(diagnostic("/removed", "removed.duplicate", `duplicate removed-token row ${entry.path}`));
    }
    paths.add(entry.path);
    if (currentPaths.has(entry.path)) {
      diagnostics.push(diagnostic("/removed", "removed.stale", `removed-token row ${entry.path} names a live portable token`));
    }
  }
  const targets = new Set<string>();
  for (const entry of parsed.data.removedTargets) {
    if (targets.has(entry.target)) {
      diagnostics.push(diagnostic("/removedTargets", "removed.target.duplicate", `duplicate removed-target row ${entry.target}`));
    }
    targets.add(entry.target);
    if (currentTargets.has(entry.target)) {
      diagnostics.push(diagnostic("/removedTargets", "removed.target.stale", `removed-target row ${entry.target} names a live CSS output`));
    }
  }
  return { paths, targets };
}

/** Read the merge-base vault out of a real worktree. The one caller is {@link readTokenRemovalBaseline}, which
 *  is how a rootless caller (the gate-runtime ResourceHost provider) obtains the same document as DATA. */
function previousTokenDocument(repoRoot: string, baseRef: string, diagnostics: TokenContractDiagnostic[]): unknown | null {
  if (!existsSync(join(repoRoot, ".git"))) {
    diagnostics.push(diagnostic("/removed", "removed.baseline", `cannot inspect token history: ${repoRoot} is not a Git worktree`));
    return null;
  }
  try {
    const mergeBase = execFileSync("git", ["merge-base", "HEAD", baseRef], { cwd: repoRoot, encoding: "utf8" }).trim();
    const treePaths = execFileSync("git", ["ls-tree", "-r", "--name-only", mergeBase, "--", TOKEN_REPO_PATH], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
    if (!treePaths.includes(TOKEN_REPO_PATH)) {
      diagnostics.push(diagnostic("/removed", "removed.baseline", `${TOKEN_REPO_PATH} is absent from merge base ${mergeBase}`));
      return null;
    }
    const text = execFileSync("git", ["show", `${mergeBase}:${TOKEN_REPO_PATH}`], { cwd: repoRoot, encoding: "utf8" });
    return JSON.parse(text) as unknown;
  } catch (error) {
    diagnostics.push(
      diagnostic("/removed", "removed.baseline", `cannot inspect token history against ${baseRef}: ${error instanceof Error ? error.message : String(error)}`),
    );
    return null;
  }
}

/** THE REMOVAL RATCHET'S OTHER SIDE, as DATA rather than as a repository (#2183).
 *
 *  `previousTokenDocument` shells `git merge-base` + `git show` from a repo root, which is exactly the read a
 *  gate-runtime POLICY cannot make: a final `defineGate` policy receives no root, no filesystem and no
 *  subprocess (`gate-runtime-standardization.md` §12.3), so `tokens-contract`'s conversion would have SILENTLY
 *  DROPPED the removal ratchet — half its stated subject — while every other check stayed green. Accepting the
 *  merge-base document as a value lets a caller that CAN read git (the ResourceHost provider, the same shape
 *  `tracked-files` already uses) hand it in.
 *
 *  UNAVAILABLE IS A DIAGNOSTIC, NOT A SKIP. A caller that could not read the history says so and the validator
 *  emits `removed.baseline`, which is what the worktree arm already does — the two paths cannot diverge into
 *  "no history" meaning a clean vault on one of them. */
export type TokenRemovalBaseline =
  | { readonly status: "ready"; readonly mergeBase: string; readonly document: unknown }
  /** The repository has NO HISTORY at all — a fresh `git init` with no commit, which is exactly what a
   *  conformance fixture root is. There is nothing a removal could have been removed FROM, so the ratchet is
   *  VACUOUS rather than blind and emits no diagnostic. Distinguishing this from `unavailable` is what lets
   *  a proof fixture be clean while a real worktree whose history read FAILED still says so out loud. */
  | { readonly status: "empty"; readonly reason: string }
  | { readonly status: "unavailable"; readonly reason: string };

interface RemovedDiffContext {
  readonly baseline: TokenRemovalBaseline;
  readonly currentPaths: ReadonlySet<string>;
  readonly currentTargets: ReadonlySet<string>;
  readonly ledger: RemovedLedger;
  readonly diagnostics: TokenContractDiagnostic[];
}

function validateRemovedDiff(context: RemovedDiffContext): void {
  const { baseline, currentPaths, currentTargets, ledger, diagnostics } = context;
  if (baseline.status === "empty") {
    return;
  }
  if (baseline.status !== "ready") {
    diagnostics.push(diagnostic("/removed", "removed.baseline", baseline.reason));
    return;
  }
  const previous = baseline.document;
  for (const path of tokenPathsFromLegacy(previous)) {
    if (!(currentPaths.has(path) || ledger.paths.has(path))) {
      diagnostics.push(diagnostic("/removed", "removed.unrecorded", `portable token ${path} was removed without a ledger row`));
    }
  }
  for (const target of tokenTargetsFromLegacy(previous)) {
    if (!(currentTargets.has(target) || ledger.targets.has(target))) {
      diagnostics.push(diagnostic("/removedTargets", "removed.target.unrecorded", `CSS output ${target} was removed without a removedTargets ledger row`));
    }
  }
}

/** The merge-base vault, read out of a real worktree, as the DATA {@link validateTokenContractTexts} takes.
 *  Exported so a caller with a repo root but no business calling the validator — the gate-runtime
 *  ResourceHost provider — can acquire the ratchet's other side once and hand it in. */
export function readTokenRemovalBaseline(repoRoot: string, baseRef = TOKEN_REMOVAL_BASE_REF): TokenRemovalBaseline {
  if (!existsSync(join(repoRoot, ".git"))) {
    return { status: "empty", reason: `${repoRoot} is not a Git worktree, so there is no token history to ratchet against` };
  }
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", "HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });
  } catch {
    // NO COMMIT AT ALL. A repository with no history has nothing a token could have been removed FROM, so
    // this is VACUOUS rather than blind — and it is exactly what a `mode: "resource"` conformance root is
    // (`ops/policy-conformance.ts` `git init`s and `git add`s the fixture, and never commits). Reporting a
    // `removed.baseline` diagnostic here would put one finding on every proof row of every consumer and
    // make a clean corpus unprovable; reporting nothing on a REAL worktree whose history read FAILED is the
    // silent skip this whole reader exists to end. The two are different conditions and answer differently.
    return { status: "empty", reason: `${repoRoot} has no commits, so there is no token history to ratchet against` };
  }
  // `previousTokenDocument` pushes exactly one diagnostic on every path that returns null, which is why the
  // reason is read off it rather than re-spelled here — one wording, and it stays the wording the worktree
  // arm has always emitted.
  // `previousTokenDocument` pushes exactly one diagnostic on every path that returns null; the reason is
  // JOINED off the collected list rather than indexed out of it so the wording stays the one the worktree
  // arm has always emitted without either an index guard tsc demands or a fallback biome calls unreachable.
  const diagnostics: TokenContractDiagnostic[] = [];
  const document = previousTokenDocument(repoRoot, baseRef, diagnostics);
  if (document === null) {
    return { status: "unavailable", reason: diagnostics.map(({ message }) => message).join("; ") };
  }
  return { status: "ready", mergeBase: baseRef, document };
}

/** `baseline` is EITHER a repo root (the worktree caller: `validateTokenContract`, the build) OR the
 *  already-read merge-base document (the rootless caller: the gate policy, through its declared resource).
 *  Both arms reach the same `validateRemovedDiff`; omitting it is what SKIPS the ratchet, and only the two
 *  callers that genuinely have no history — a conformance fixture and a non-worktree consumer — do that. */
export function validateTokenContractTexts(
  texts: TokenContractTexts,
  baseline?: string | TokenRemovalBaseline,
  baseRef = TOKEN_REMOVAL_BASE_REF,
): TokenContractResult {
  const diagnostics: TokenContractDiagnostic[] = [];
  const formatHash = sha256(texts.formatSchema);
  const resolverHash = sha256(texts.resolverSchema);
  if (formatHash !== FORMAT_SCHEMA_SHA256) {
    diagnostics.push(diagnostic(TOKEN_FILES.formatSchema, "schema.hash", `official Format schema hash ${formatHash} does not match ${FORMAT_SCHEMA_SHA256}`));
  }
  if (resolverHash !== RESOLVER_SCHEMA_SHA256) {
    diagnostics.push(
      diagnostic(TOKEN_FILES.resolverSchema, "schema.hash", `official Resolver schema hash ${resolverHash} does not match ${RESOLVER_SCHEMA_SHA256}`),
    );
  }
  const formatSchema = parseJson(texts.formatSchema, TOKEN_FILES.formatSchema, diagnostics);
  const resolverSchema = parseJson(texts.resolverSchema, TOKEN_FILES.resolverSchema, diagnostics);
  const base = parseJson(texts.base, TOKEN_FILES.base, diagnostics);
  const light = parseJson(texts.light, TOKEN_FILES.light, diagnostics);
  const mocha = parseJson(texts.mocha, TOKEN_FILES.mocha, diagnostics);
  const resolver = parseJson(texts.resolver, TOKEN_FILES.resolver, diagnostics);
  const removed = parseJson(texts.removed, TOKEN_FILES.removed, diagnostics);
  if (![formatSchema, resolverSchema, base, light, mocha, resolver, removed].every((value) => value !== null)) {
    return { diagnostics, scannedTokens: 0, baseTokens: [], lightTokens: new Map(), mochaTokens: new Map(), cssValues: {}, cssTargets: new Set(), themes: [] };
  }
  let formatValidate: ValidateFunction;
  let resolverValidate: ValidateFunction;
  try {
    formatValidate = compileSchema(formatSchema);
    resolverValidate = compileSchema(resolverSchema);
  } catch (error) {
    diagnostics.push(diagnostic("schemas", "schema.compile", error instanceof Error ? error.message : String(error)));
    return { diagnostics, scannedTokens: 0, baseTokens: [], lightTokens: new Map(), mochaTokens: new Map(), cssValues: {}, cssTargets: new Set(), themes: [] };
  }
  diagnostics.push(...ajvDiagnostics(TOKEN_FILES.base, "format.schema", formatValidate, base));
  diagnostics.push(...ajvDiagnostics(TOKEN_FILES.light, "format.schema", formatValidate, light));
  diagnostics.push(...ajvDiagnostics(TOKEN_FILES.mocha, "format.schema", formatValidate, mocha));
  diagnostics.push(...ajvDiagnostics(TOKEN_FILES.resolver, "resolver.schema", resolverValidate, resolver));
  const baseTokens: ContractToken[] = [];
  const lightTokenList: ContractToken[] = [];
  const mochaTokenList: ContractToken[] = [];
  if (isObject(base)) {
    collectTokens(base, [], null, { diagnostics, tokens: baseTokens });
  }
  if (isObject(light)) {
    collectTokens(light, [], null, { diagnostics, tokens: lightTokenList });
  }
  if (isObject(mocha)) {
    collectTokens(mocha, [], null, { diagnostics, tokens: mochaTokenList });
  }
  if (baseTokens.length + lightTokenList.length + mochaTokenList.length === 0) {
    diagnostics.push(diagnostic(TOKEN_FILES.base, "token.scan.empty", "token contract scanned zero tokens; clean output would be blind"));
  }
  validateAliases(baseTokens, diagnostics);
  validateFonts(baseTokens, diagnostics);
  validateInheritedValues(baseTokens, formatValidate, diagnostics);
  validateInheritedValues(lightTokenList, formatValidate, diagnostics);
  validateInheritedValues(mochaTokenList, formatValidate, diagnostics);
  const basePaths = new Set(baseTokens.map((token) => token.pathString));
  const requiredSeedPaths = new Set(REQUIRED_SEED_VALUE_SET_PATHS);
  const requiredLightPaths = new Set([
    ...requiredSeedPaths,
    ...baseTokens.filter((token) => token.outputRole === "light-dark").map((token) => token.pathString),
  ]);
  validateSeedTokens({ name: "Light", tokens: lightTokenList, basePaths, requiredPaths: requiredLightPaths, diagnostics });
  validateSeedTokens({ name: "Mocha", tokens: mochaTokenList, basePaths, requiredPaths: requiredSeedPaths, diagnostics });
  const cssValues = isObject(base) ? parseRootExtensions(base, basePaths, diagnostics) : {};
  const lightTokens = asTokenMap(lightTokenList);
  const mochaTokens = asTokenMap(mochaTokenList);
  const cssTargets = validateOutputTargets(baseTokens, lightTokens, cssValues, diagnostics);
  const themes = isObject(resolver) ? validateResolverSubset(resolver, diagnostics) : [];
  const ledger = validateRemovedLedger(removed, basePaths, cssTargets, diagnostics);
  if (baseline !== undefined) {
    const resolved = typeof baseline === "string" ? readTokenRemovalBaseline(baseline, baseRef) : baseline;
    validateRemovedDiff({ baseline: resolved, currentPaths: basePaths, currentTargets: cssTargets, ledger, diagnostics });
  }
  return {
    diagnostics,
    scannedTokens: baseTokens.length + lightTokenList.length + mochaTokenList.length,
    baseTokens,
    lightTokens,
    mochaTokens,
    cssValues,
    cssTargets,
    themes,
  };
}

export function readTokenContractTexts(uiRoot = import.meta.dirname): TokenContractTexts {
  const read = (path: string): string => readFileSync(join(uiRoot, path), "utf8");
  return {
    base: read(TOKEN_FILES.base),
    light: read(TOKEN_FILES.light),
    mocha: read(TOKEN_FILES.mocha),
    resolver: read(TOKEN_FILES.resolver),
    removed: read(TOKEN_FILES.removed),
    formatSchema: read(TOKEN_FILES.formatSchema),
    resolverSchema: read(TOKEN_FILES.resolverSchema),
  };
}

export function validateTokenContract(uiRoot = import.meta.dirname, repoRoot?: string): TokenContractResult {
  return validateTokenContractTexts(readTokenContractTexts(uiRoot), repoRoot);
}

export function assertTokenContract(uiRoot = import.meta.dirname, repoRoot?: string): TokenContractResult {
  const result = validateTokenContract(uiRoot, repoRoot);
  if (result.diagnostics.length > 0) {
    throw new Error(
      `token contract failed (${result.diagnostics.length} finding(s), scanned ${result.scannedTokens} tokens):\n${result.diagnostics
        .map((item) => `${item.path} [${item.code}] ${item.message}`)
        .join("\n")}`,
    );
  }
  return result;
}
