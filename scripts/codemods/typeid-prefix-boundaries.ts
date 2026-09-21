// Reusable #2536 migration: replace canonical `brandedId<TypeId>()` trust-boundary schemas with
// `typeIdSchema(ID_PREFIX.<member>)`. The checker, not written type/import spellings, decides which
// calls carry a canonical TypeIdOf brand. Prefixless Branded<...> ids remain on brandedId.
//
// Preview (default): pnpm codemod:run scripts/codemods/typeid-prefix-boundaries.ts
// Apply:             pnpm codemod:run scripts/codemods/typeid-prefix-boundaries.ts --apply

// The run is all-or-nothing. An unreadable brandedId door, a non-literal/ambiguous canonical brand,
// a missing ID_PREFIX member, or a semantic/mutable-source mismatch refuses before any plan mutates.

import { relative, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { CallExpression, CodemodContext, ImportSpecifier, Plan, SourceFile } from "@orb/tooling/codemod";
import { addNamedImport, applyTextReplacements, CodemodError, composePlans, Node, removeNamedImport, runCodemod, SyntaxKind } from "@orb/tooling/codemod";
import { canonicalIdBrand, createKitIdCallMatcher, deriveCanonicalTypeIdPrefixes, ID_BRAND_HOME } from "../../tooling/src/verify/lib/id-brand.ts";

const KIT_IDS_MODULE = "@orb/kit/ids";
const MAX_REFUSAL_DETAILS = 20;
const PRODUCTION_SOURCE = /^packages\/[^/]+\/src\/.*\.(?:ts|tsx)$/u;
const STRING_LITERAL_TYPE = /^"(?:[^"\\]|\\.)*"$/u;

interface PlannedReplacement {
  readonly filePath: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly label: string;
}

interface MigrationScan {
  readonly replacements: PlannedReplacement[];
  readonly targetsByPath: Map<string, CallExpression[]>;
  readonly targetFiles: Set<string>;
  readonly refusals: string[];
  canonicalCalls: number;
  prefixlessCalls: number;
  unreadableCalls: number;
}

interface CanonicalCallScan {
  readonly ctx: CodemodContext;
  readonly sourceFile: SourceFile;
  readonly relativePath: string;
  readonly call: CallExpression;
  readonly prefixMembers: ReadonlyMap<string, string>;
  readonly scan: MigrationScan;
}

interface SourceFileScan {
  readonly ctx: CodemodContext;
  readonly sourceFile: SourceFile;
  readonly prefixMembers: ReadonlyMap<string, string>;
  readonly isBrandedId: ReturnType<typeof createKitIdCallMatcher>;
  readonly scan: MigrationScan;
}

function repoRelative(root: string, sourceFile: SourceFile): string {
  return relative(root, sourceFile.getFilePath()).split(sep).join("/");
}

function fail(message: string, details: readonly string[]): never {
  const shown = details.slice(0, MAX_REFUSAL_DETAILS);
  const tail = details.length > shown.length ? `\n  … ${String(details.length - shown.length)} more` : "";
  throw new CodemodError(`${message}\n  ${shown.join("\n  ")}${tail}`, "Resolve every refusal, then rerun the dry-run. No partial migration is planned.");
}

function prefixMemberIndex(ids: SourceFile): ReadonlyMap<string, readonly string[]> {
  const initializer = ids.getVariableDeclaration("ID_PREFIX")?.getInitializer();
  const unwrapped = initializer !== undefined && Node.isAsExpression(initializer) ? initializer.getExpression() : initializer;
  if (unwrapped === undefined || !Node.isObjectLiteralExpression(unwrapped)) {
    fail("TypeID migration cannot read the canonical ID_PREFIX object.", [ID_BRAND_HOME]);
  }
  const membersByPrefix = new Map<string, string[]>();
  for (const property of unwrapped.getProperties().filter(Node.isPropertyAssignment)) {
    const value = property.getInitializer();
    if (!(Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value))) {
      continue;
    }
    const members = membersByPrefix.get(value.getLiteralText()) ?? [];
    members.push(property.getName());
    membersByPrefix.set(value.getLiteralText(), members);
  }
  return membersByPrefix;
}

function uniquePrefixMember(prefix: string, members: readonly string[], refused: string[]): string | undefined {
  if (members.length !== 1) {
    refused.push(`${JSON.stringify(prefix)} resolves to ${String(members.length)} ID_PREFIX members${members.length === 0 ? "" : `: ${members.join(", ")}`}`);
    return;
  }
  const member = members[0];
  if (member === undefined || !/^[$A-Z_a-z][$\w]*$/u.test(member)) {
    refused.push(`${JSON.stringify(prefix)} has a non-property-access ID_PREFIX member: ${String(member)}`);
    return;
  }
  return member;
}

/** Derive prefix -> ID_PREFIX property from kit's authored object and prove it covers every direct
 *  TypeIdOf<"prefix"> alias. A copied table would drift as soon as a new entity id lands. */
function canonicalPrefixMembers(files: readonly SourceFile[], root: string): ReadonlyMap<string, string> {
  const prefixes = deriveCanonicalTypeIdPrefixes(files, (sourceFile) => repoRelative(root, sourceFile));
  if (prefixes.size === 0) {
    fail("TypeID migration cannot read the canonical TypeIdOf vocabulary.", [ID_BRAND_HOME]);
  }
  const ids = files.find((sourceFile) => repoRelative(root, sourceFile) === ID_BRAND_HOME);
  if (ids === undefined) {
    fail("TypeID migration cannot read the canonical ids module.", [ID_BRAND_HOME]);
  }
  const membersByPrefix = prefixMemberIndex(ids);
  const refused: string[] = [];
  const resolved = new Map<string, string>();
  for (const prefix of prefixes) {
    const member = uniquePrefixMember(prefix, membersByPrefix.get(prefix) ?? [], refused);
    if (member !== undefined) {
      resolved.set(prefix, member);
    }
  }
  if (refused.length > 0) {
    fail("TypeID migration found an incomplete or ambiguous canonical prefix map.", refused);
  }
  return resolved;
}

function literalBrand(text: string): string | undefined {
  if (!STRING_LITERAL_TYPE.test(text)) {
    return;
  }
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === "string" ? parsed : undefined;
}

function importSpecifierFor(identifier: Node): ImportSpecifier | undefined {
  if (!Node.isIdentifier(identifier)) {
    return;
  }
  return identifier
    .getSymbol()
    ?.getDeclarations()
    .find((declaration): declaration is ImportSpecifier => Node.isImportSpecifier(declaration));
}

function targetImportReferenceKeys(targets: readonly CallExpression[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const call of targets) {
    const callee = call.getExpression();
    if (Node.isIdentifier(callee)) {
      keys.add(`${String(callee.getStart())}:${String(callee.getEnd())}`);
    }
    const typeTarget = call.getTypeArguments()[0];
    if (typeTarget === undefined) {
      continue;
    }
    if (Node.isIdentifier(typeTarget)) {
      keys.add(`${String(typeTarget.getStart())}:${String(typeTarget.getEnd())}`);
    }
    for (const identifier of typeTarget.getDescendantsOfKind(SyntaxKind.Identifier)) {
      keys.add(`${String(identifier.getStart())}:${String(identifier.getEnd())}`);
    }
  }
  return keys;
}

/** Remove a named import only when every reference to that exact local binding is inside a call or
 *  generic target being replaced. Prefixless calls and any surviving type/value use keep the import. */
function removableImports(sourceFile: SourceFile, targets: readonly CallExpression[]): ReadonlyArray<readonly [moduleSpecifier: string, name: string]> {
  const targetReferences = targetImportReferenceKeys(targets);
  const removals = new Map<string, string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    for (const specifier of declaration.getNamedImports()) {
      const refs = sourceFile
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter((identifier) => identifier.getFirstAncestorByKind(SyntaxKind.ImportSpecifier) !== specifier && importSpecifierFor(identifier) === specifier);
      if (refs.length === 0 || refs.some((identifier) => !targetReferences.has(`${String(identifier.getStart())}:${String(identifier.getEnd())}`))) {
        continue;
      }
      removals.set(`${declaration.getModuleSpecifierValue()}\0${specifier.getName()}`, specifier.getName());
    }
  }
  return [...removals].map(([key, name]) => [key.slice(0, key.indexOf("\0")), name] as const);
}

function scanCanonicalCall(options: CanonicalCallScan): void {
  const { ctx, sourceFile, relativePath, call, prefixMembers, scan } = options;
  scan.canonicalCalls += 1;
  const args = call.getTypeArguments();
  const target = args[0];
  if (args.length !== 1 || target === undefined) {
    scan.refusals.push(`${relativePath}:${String(call.getStartLineNumber())} canonical brandedId call has ${String(args.length)} type arguments`);
    return;
  }
  const checker = sourceFile.getProject().getTypeChecker();
  const brandText = canonicalIdBrand(checker.getTypeAtLocation(target), target, checker);
  if (brandText === null) {
    scan.refusals.push(`${relativePath}:${String(call.getStartLineNumber())} target ${target.getText()} does not resolve to kit's canonical brand phantom`);
    return;
  }
  const brand = literalBrand(brandText);
  if (brand === undefined) {
    scan.refusals.push(`${relativePath}:${String(call.getStartLineNumber())} target ${target.getText()} has ambiguous/non-literal brand ${brandText}`);
    return;
  }
  const member = prefixMembers.get(brand);
  if (member === undefined) {
    scan.prefixlessCalls += 1;
    return;
  }
  const mutable = ctx.project.getSourceFile(sourceFile.getFilePath());
  if (mutable === undefined || mutable.getFullText().slice(call.getStart(), call.getEnd()) !== call.getText()) {
    scan.refusals.push(`${relativePath}:${String(call.getStartLineNumber())} semantic call span does not match the mutable source carrier`);
    return;
  }
  const list = scan.targetsByPath.get(sourceFile.getFilePath()) ?? [];
  list.push(call);
  scan.targetsByPath.set(sourceFile.getFilePath(), list);
  scan.targetFiles.add(sourceFile.getFilePath());
  scan.replacements.push({
    filePath: sourceFile.getFilePath(),
    start: call.getStart(),
    end: call.getEnd(),
    text: `typeIdSchema(ID_PREFIX.${member})`,
    label: `${call.getText()} -> typeIdSchema(ID_PREFIX.${member})`,
  });
}

function scanSourceFile(options: SourceFileScan): void {
  const { ctx, sourceFile, prefixMembers, isBrandedId, scan } = options;
  const relativePath = repoRelative(ctx.repoRoot, sourceFile);
  if (!PRODUCTION_SOURCE.test(relativePath)) {
    return;
  }
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const seam = isBrandedId(call);
    if (seam === "other") {
      continue;
    }
    if (seam === "unreadable") {
      scan.unreadableCalls += 1;
      scan.refusals.push(`${relativePath}:${String(call.getStartLineNumber())} cannot resolve brandedId origin`);
      continue;
    }
    scanCanonicalCall({ ctx, sourceFile, relativePath, call, prefixMembers, scan });
  }
}

function scanTypeIdBoundaries(ctx: CodemodContext, files: readonly SourceFile[], prefixMembers: ReadonlyMap<string, string>): MigrationScan {
  const scan: MigrationScan = {
    replacements: [],
    targetsByPath: new Map(),
    targetFiles: new Set(),
    refusals: [],
    canonicalCalls: 0,
    prefixlessCalls: 0,
    unreadableCalls: 0,
  };
  const isBrandedId = createKitIdCallMatcher("brandedId");
  for (const sourceFile of files) {
    scanSourceFile({ ctx, sourceFile, prefixMembers, isBrandedId, scan });
  }
  return scan;
}

function importPlans(ctx: CodemodContext, semanticFiles: readonly SourceFile[], scan: MigrationScan): Plan[] {
  const plans: Plan[] = [];
  const semanticByPath = new Map<string, SourceFile>(semanticFiles.map((sourceFile) => [sourceFile.getFilePath(), sourceFile]));
  for (const filePath of [...scan.targetFiles].sort((left, right) => left.localeCompare(right))) {
    plans.push(addNamedImport(ctx, filePath, { moduleSpecifier: KIT_IDS_MODULE, name: "ID_PREFIX" }));
    plans.push(addNamedImport(ctx, filePath, { moduleSpecifier: KIT_IDS_MODULE, name: "typeIdSchema" }));
    const semanticSource = semanticByPath.get(filePath);
    if (semanticSource === undefined) {
      fail("TypeID migration lost a semantic source while planning imports.", [filePath]);
    }
    for (const [moduleSpecifier, name] of removableImports(semanticSource, scan.targetsByPath.get(filePath) ?? [])) {
      plans.push(removeNamedImport(ctx, filePath, { moduleSpecifier, names: [name] }));
    }
  }
  return plans;
}

/** Build one stale-node-safe, world-aware plan. Call this before any other plan mutates the project. */
export function migrateTypeIdBoundarySchemas(ctx: CodemodContext): Plan {
  const semantic = ctx.semantic();
  const semanticFiles = semantic.sourceFiles();
  const prefixMembers = canonicalPrefixMembers(semanticFiles, ctx.repoRoot);
  const scan = scanTypeIdBoundaries(ctx, semanticFiles, prefixMembers);

  if (scan.refusals.length > 0) {
    fail(
      `TypeID migration refused ${String(scan.refusals.length)} site(s) (${String(scan.canonicalCalls)} canonical brandedId calls, ${String(scan.prefixlessCalls)} proven prefixless, ${String(scan.unreadableCalls)} unreadable doors).`,
      scan.refusals,
    );
  }

  ctx.log(
    `TypeID denominator: ${String(scan.canonicalCalls)} canonical brandedId call(s) = ${String(scan.replacements.length)} TypeID replacement(s) + ${String(scan.prefixlessCalls)} preserved prefixless brand(s); ${String(scan.unreadableCalls)} refusal(s).`,
  );

  const plans: Plan[] = [
    applyTextReplacements(ctx, scan.replacements, { note: "replace canonical TypeID boundary schemas" }),
    ...importPlans(ctx, semanticFiles, scan),
  ];

  return composePlans(
    `Migrate ${String(scan.replacements.length)} TypeID boundary schema(s) across ${String(scan.targetFiles.size)} file(s); preserve ${String(scan.prefixlessCalls)} prefixless brand(s)`,
    plans,
  );
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await runCodemod(
    "typeid-prefix-boundaries",
    (ctx) => {
      ctx.plan(migrateTypeIdBoundarySchemas(ctx));
    },
    { argv: process.argv.slice(2) },
  );
}
