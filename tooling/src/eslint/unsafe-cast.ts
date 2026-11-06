// A cast that tells the checker a lie it cannot catch: a double cast through `unknown`, a parsed JSON blob named as a
// type, an untyped value named as a contract, row, brand or object type, a brand stripped to its string, and a plain
// string made a brand by `castId` or `as` outside the seam that owns the brand.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import ts from "typescript";
import { requireTypeServices } from "./checker.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { declaredInContract } from "./trpc-output.ts";

/** One cast that is a real boundary, not a site waiting to be fixed: `site` is the source text of the expression it
 *  casts, or of the argument a `castId` call brands. */
export interface UnsafeCastHome {
  readonly file: string;
  readonly site: string;
  readonly reason: string;
}

// Law 4 in docs/law/Spine-TypeScript-and-Patterns.md: a brand mints only at a trusted seam.
const MINT_RULING = "law 4 (a brand mints only at its trusted seam)";

/** The casts that are the boundary itself: data that arrives untyped by construction, or a brand's own minting seam. */
export const UNSAFE_CAST_HOMES = [
  {
    file: "packages/contracts/src/plugin/manifest.ts",
    site: 'Reflect.get(globalThis, "URL")',
    reason: "the WHATWG `URL` global exists in every runtime yet in neither lib this package compiles under, so it can only be read untyped",
  },
  {
    file: "packages/inference/src/backends/local-light/model-worker.ts",
    site: "workerData",
    reason: "`workerData` arrives untyped across the thread boundary from this worker's own spawner",
  },
  {
    file: "packages/ui/src/lib/live-token-resolver.ts",
    site: "globalThis as unknown",
    reason:
      "reads DOM globals through structural shims so the module compiles in the DOM-less node world; `globalThis` has no type in common with them in either world",
  },
  {
    file: "packages/server/src/infra/plugin-host/worker-runtime.ts",
    site: "workerData",
    reason: "`workerData` arrives untyped across the thread boundary from this worker's own broker",
  },
  {
    file: "packages/server/src/infra/plugin-host/worker-runtime.ts",
    site: "message.value",
    reason: "a command value is structured-cloned across the thread boundary from this worker's own broker, which carries no type",
  },
  {
    file: "packages/kit/src/png-card-chunk/index.ts",
    site: "(globalThis as Record<string, unknown>)[DECOMPRESSION_STREAM_GLOBAL]",
    reason: "kit declares no DOM or node types, so the platform `DecompressionStream` global can only be read untyped",
  },
  {
    file: "packages/ui/src/lib/class-merge.ts",
    site: "Reflect.apply(target, thisArg, args)",
    reason: "Tailwind Variants' overloads resolve to `any` through `Reflect.apply`; every one of them returns a variant component",
  },
  {
    file: "packages/ui/src/markdown/dice-inline.tsx",
    site: "this",
    reason: "unified binds the plugin's processor as an untyped `this` through Streamdown's plugin list",
  },
  {
    file: "packages/ui/src/markdown/dice-inline.tsx",
    site: "tree",
    reason: "unified hands the transformer an untyped mdast tree; the local node type is the subset the walk reads",
  },
  {
    file: "packages/ui/src/markdown/reveal-plugin.ts",
    site: "tree",
    reason: "unified hands the transformer an untyped hast tree; the local node type is the subset the walk reads",
  },
  {
    file: "packages/kit/src/handle-key/index.ts",
    site: "keyPass(keyPass(text, data), data)",
    reason: `${MINT_RULING}: \`handleKey\` is the one mint of a comparison key, and an empty handle keys to an empty key`,
  },
  {
    file: "packages/client/src/data/use-session-recovery.ts",
    site: "me.userId",
    reason: `${MINT_RULING}: the \`sessions.me\` result is the one source of a \`VerifiedUserId\`, which no text parser may mint`,
  },
  {
    file: "packages/kit/src/content/index.ts",
    site: "target.slice(ASSET_SCHEME.length)",
    reason: `${MINT_RULING}: an \`asset:\` ref in prose is a lookup key; every resolver reads it by owner and treats an unknown id as a miss`,
  },
] as const satisfies readonly UnsafeCastHome[];

/** A file where a plain string becomes a brand by construction: the module that defines the brands and their parsers. */
export interface BrandMintHome {
  readonly file: string;
  readonly reason: string;
}

/** The files that mint brands from plain strings. Add one only for the module that owns brand validation. */
export const BRAND_MINT_HOMES = [
  {
    file: "packages/kit/src/ids/index.ts",
    reason: `${MINT_RULING}: the id module defines \`castId\`, \`mintTypeId\` and the brand schemas every other mint goes through`,
  },
] as const satisfies readonly BrandMintHome[];

const KIT_IDS = /\/packages\/kit\/src\/ids\/index\.ts$/u;
// The shape of a drizzle row alias; the inferred select type of a table has no name to test.
const ROW_NAME = /Row$/u;
const DB_FILE = /\/packages\/db\//u;

const UNTYPED = new Set<string>([AST_NODE_TYPES.TSUnknownKeyword, AST_NODE_TYPES.TSAnyKeyword]);

// The constraint of `castId`'s type parameter is the repo's own `Branded<string>`: every brand is assignable to it and a bare string is not.
const brandCache = new WeakMap<ts.Program, ts.Type | null>();

export function brandedString(program: ts.Program, checker: ts.TypeChecker): ts.Type | null {
  const cached = brandCache.get(program);
  if (cached !== undefined) {
    return cached;
  }
  const source = program.getSourceFiles().find(({ fileName }) => KIT_IDS.test(fileName));
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source)?.exports?.get(ts.escapeLeadingUnderscores("castId"));
  const [signature] =
    symbol === undefined || source === undefined ? [] : checker.getSignaturesOfType(checker.getTypeOfSymbolAtLocation(symbol, source), ts.SignatureKind.Call);
  const parameter = signature?.typeParameters?.[0];
  const brand = parameter === undefined ? null : (checker.getBaseConstraintOfType(parameter) ?? null);
  brandCache.set(program, brand);
  return brand;
}

const isJsonParse = (node: TSESTree.Node): boolean =>
  node.type === AST_NODE_TYPES.CallExpression &&
  node.callee.type === AST_NODE_TYPES.MemberExpression &&
  !node.callee.computed &&
  node.callee.object.type === AST_NODE_TYPES.Identifier &&
  node.callee.object.name === "JSON" &&
  node.callee.property.type === AST_NODE_TYPES.Identifier &&
  node.callee.property.name === "parse";

const isConstCast = (annotation: TSESTree.TypeNode): boolean =>
  annotation.type === AST_NODE_TYPES.TSTypeReference && annotation.typeName.type === AST_NODE_TYPES.Identifier && annotation.typeName.name === "const";

// `(LIST as readonly string[]).includes(value)` widens a literal tuple to test a string against it; nothing is asserted about the value.
const isIncludesReceiver = (node: TSESTree.TSAsExpression): boolean =>
  node.parent.type === AST_NODE_TYPES.MemberExpression &&
  node.parent.object === node &&
  node.parent.property.type === AST_NODE_TYPES.Identifier &&
  node.parent.property.name === "includes";

const DOUBLE_CAST = "a double cast through `unknown` hides the real mismatch from the checker: parse the value with its schema, or narrow it with a guard";
const JSON_CAST = "`JSON.parse` returns an untyped value: parse it with the schema of the type you name, never assert it";
const UNTYPED_CAST =
  "an untyped value named as a contract, row or branded type is a promise nothing checks: validate it at the boundary with the type's schema (`castId` is for a trusted seam only)";
const UNTYPED_SHAPE = "an untyped value named as an object type is a promise nothing checks: parse it with the owning schema, or narrow it with a type guard";
const STRIPPED_BRAND = "`as string` strips a brand the checker was holding: a branded id is already a string where a string is wanted";
const MINTED_BRAND =
  "a plain string named as a brand is a promise nothing checks: parse it with the brand's schema (`typeIdSchema`, `brandedId`), or mint it at a home seam";
const REDUNDANT_CAST_ID = "`castId` of a value that already carries the brand asserts nothing: drop the call";

// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
const isUntyped = (type: ts.Type): boolean => (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
// `never` is assignable to every brand, so `as never` would read as a brand cast though it names none.
// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
const isNever = (type: ts.Type): boolean => (type.flags & ts.TypeFlags.Never) !== 0;
// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
const isObjectFlagged = (type: ts.Type): boolean => (type.flags & (ts.TypeFlags.Object | ts.TypeFlags.NonPrimitive)) !== 0;
// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
const PRIMITIVE_FLAGS = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.ESSymbolLike;
// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
const isPrimitive = (type: ts.Type): boolean => (type.flags & PRIMITIVE_FLAGS) !== 0;

// An object, array, function or interface type, or a union holding one. An intersection with a primitive is a brand, not a shape.
function isShape(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.some(isShape);
  }
  if (type.isIntersection()) {
    return !type.types.some(isPrimitive) && type.types.some(isShape);
  }
  return isObjectFlagged(type);
}

// `castId` imported from the kit id module, through any import alias; a local function of the same name is not it.
function isKitCastId(checker: ts.TypeChecker, callee: ts.Node): boolean {
  const symbol = checker.getSymbolAtLocation(callee);
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  const target = symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
  return (
    target?.getName() === "castId" &&
    (target.declarations ?? []).some((declaration) => KIT_IDS.test(declaration.getSourceFile().fileName.replaceAll("\\", "/")))
  );
}

function namesRow(type: ts.Type): boolean {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  return (
    symbol !== undefined &&
    (ROW_NAME.test(symbol.getName()) || (symbol.declarations ?? []).some((declaration) => DB_FILE.test(declaration.getSourceFile().fileName)))
  );
}

// What the syntax alone settles; null when the checker has to be asked.
function syntacticReason(node: TSESTree.TSAsExpression): string | null {
  const { expression } = node;
  if (expression.type === AST_NODE_TYPES.TSAsExpression && UNTYPED.has(expression.typeAnnotation.type)) {
    return DOUBLE_CAST;
  }
  return isJsonParse(expression) ? JSON_CAST : null;
}

interface Judge {
  readonly checker: ts.TypeChecker;
  readonly isBrand: (type: ts.Type) => boolean;
  // The file is a mint home: a plain string may become a brand here.
  readonly mints: boolean;
}

function untypedReason({ checker, isBrand }: Judge, target: ts.Type): string | null {
  if (declaredInContract(checker, target) || namesRow(target) || isBrand(target)) {
    return UNTYPED_CAST;
  }
  return isShape(target) ? UNTYPED_SHAPE : null;
}

function typedReason(judge: Judge, node: TSESTree.TSAsExpression, target: ts.Type, carried: ts.Type): string | null {
  if (isUntyped(carried)) {
    return untypedReason(judge, target);
  }
  if (node.typeAnnotation.type === AST_NODE_TYPES.TSStringKeyword && judge.isBrand(carried)) {
    return STRIPPED_BRAND;
  }
  // Only a cast that adds the brand is a mint. One the checker already accepts narrows nothing, and one that only drops
  // `null` or `undefined` from a value already branded is a non-null assertion, not a mint.
  return !judge.mints && judge.isBrand(target) && !judge.checker.isTypeAssignableTo(judge.checker.getNonNullableType(carried), target) ? MINTED_BRAND : null;
}

/** Refuses `x as unknown as T`, `JSON.parse(x) as T`, an `unknown` or `any` value cast to a contract, row, branded or object
 *  type, a branded value cast to `string`, and a plain string made a brand by `castId` or `as` outside a mint home.
 *  A cast named in `homes` is exempt; a file in `mintHomes` may mint brands. */
export function noUnsafeCastRule(homes: readonly UnsafeCastHome[], mintHomes: readonly BrandMintHome[]): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const { program, checker, esTreeNodeToTSNodeMap: toTs } = requireTypeServices(context);
      const filename = context.filename.replaceAll("\\", "/");
      const sites = new Set(homes.filter(({ file }) => filename.endsWith(file)).map(({ site }) => site));
      const brand = brandedString(program, checker);
      const scope: Judge = {
        checker,
        isBrand: (type) => brand !== null && !isUntyped(type) && !isNever(type) && checker.isTypeAssignableTo(type, brand),
        mints: mintHomes.some(({ file }) => filename.endsWith(file)),
      };
      const castIdCall = (node: TSESTree.CallExpression): void => {
        const [raw] = node.arguments;
        const { callee } = node;
        // `castId(x)`, or `ids.castId(x)` through a namespace import; `isKitCastId` proves the name is the kit's.
        const name = callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed ? callee.property : callee;
        if (
          scope.mints ||
          raw === undefined ||
          name.type !== AST_NODE_TYPES.Identifier ||
          sites.has(context.sourceCode.getText(raw)) ||
          !isKitCastId(checker, toTs.get(name))
        ) {
          return;
        }
        const minted = checker.isTypeAssignableTo(checker.getTypeAtLocation(toTs.get(raw)), checker.getTypeAtLocation(toTs.get(node)));
        context.report({ node, message: minted ? REDUNDANT_CAST_ID : MINTED_BRAND });
      };
      const judge = (node: TSESTree.TSAsExpression): void => {
        if (
          isConstCast(node.typeAnnotation) ||
          UNTYPED.has(node.typeAnnotation.type) ||
          isIncludesReceiver(node) ||
          sites.has(context.sourceCode.getText(node.expression))
        ) {
          return;
        }
        const message =
          syntacticReason(node) ??
          typedReason(
            scope,
            node,
            checker.getTypeFromTypeNode(toTs.get(node.typeAnnotation) as ts.TypeNode),
            checker.getTypeAtLocation(toTs.get(node.expression)),
          );
        if (message !== null) {
          context.report({ node, message });
        }
      };
      return { TSAsExpression: judge, CallExpression: castIdCall };
    },
  };
}
