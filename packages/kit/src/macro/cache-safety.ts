// Static macro analysis for prompt-prefix cache safety and user-macro volatility. This follows the
// evaluator's execution contract from registry metadata: unknown inline calls keep raw arguments inert,
// unknown blocks render evaluated children, eager arguments execute even when their value is discarded,
// lazy arguments execute only when the handler declares that it resolves them, and block handlers
// declare whether they render, discard, or branch-select their body.

import { applyArgDefaults, checkMacroArgs } from "./metadata.ts";
import { parseMacros } from "./parser.ts";
import { selectStaticIfChildren } from "./registry.ts";
import { MACRO_MAX_DEPTH, type MacroAST, type MacroBlockNode, type MacroCallNode, type MacroNode, type MacroRegistry } from "./types.ts";

interface AnalysisResult {
  readonly dependsOnTurn: boolean;
  readonly mutatesState: boolean;
}

type DependencyAxis = "cache" | "volatile";

const STATIC_RESULT: AnalysisResult = { dependsOnTurn: false, mutatesState: false };

function mergeResults(results: readonly AnalysisResult[]): AnalysisResult {
  return {
    dependsOnTurn: results.some((result) => result.dependsOnTurn),
    mutatesState: results.some((result) => result.mutatesState),
  };
}

function usesLazyArguments(node: MacroCallNode | MacroBlockNode, registry: MacroRegistry): boolean {
  if (node.flags?.immediate === true) {
    return false;
  }
  if (node.flags?.delayed === true) {
    return true;
  }
  return registry.getOptions(node.name)?.delayArgResolution === true;
}

const BLOCK_BODY_SENTINEL = "\u0000orb-block-body\u0000";
const RESOLVED_BINDING = "\u0000orb-resolved-binding\u0000";
const CACHE_BINDING = "\u0000orb-cache-binding\u0000";
const VOLATILE_BINDING = "\u0000orb-volatile-binding\u0000";

/** Encode a user-macro binding that runtime resolves before splicing into its template. */
export function macroAnalysisBinding(value: string): string {
  return `${RESOLVED_BINDING}${value}${RESOLVED_BINDING}`;
}

/** Encode a staged user input whose concrete value is unavailable during static analysis. */
export function macroAnalysisInputBinding(volatile: boolean): string {
  return volatile ? VOLATILE_BINDING : CACHE_BINDING;
}

function analyzeTextBinding(text: string, axis: DependencyAxis): AnalysisResult {
  return {
    dependsOnTurn: text.includes(VOLATILE_BINDING) || (axis === "cache" && text.includes(CACHE_BINDING)),
    mutatesState: false,
  };
}

function analyzeNestedBindings(
  text: string,
  registry: MacroRegistry,
  axis: DependencyAxis,
  expansionDepth: number,
  activeExpansions: ReadonlySet<string>,
): AnalysisResult {
  if (!text.includes(RESOLVED_BINDING) && !text.includes(CACHE_BINDING) && !text.includes(VOLATILE_BINDING)) {
    return STATIC_RESULT;
  }
  return analyzeAst(parseMacros(text), registry, axis, expansionDepth, activeExpansions);
}

function argumentIndexes(count: number, usage: "all" | "none" | readonly number[]): readonly number[] {
  if (usage === "none") {
    return [];
  }
  if (usage === "all") {
    return Array.from({ length: count }, (_unused, index) => index);
  }
  return usage.filter((index) => index >= 0 && index < count);
}

function effectiveArguments(node: MacroCallNode | MacroBlockNode, registry: MacroRegistry): readonly string[] {
  const metadata = registry.getMetadata(node.name);
  if (node.type === "block" && registry.getOptions(node.name)?.blockChildren !== true) {
    if (registry.getOptions(node.name)?.blockContentAfterDeclaredArgs === true && metadata !== undefined && !metadata.variadic) {
      const declared = node.args.slice(0, metadata.args.length);
      const extras = node.args.slice(metadata.args.length);
      const padded = applyArgDefaults(metadata, [...declared]);
      const positioned = padded.length < metadata.args.length ? [...padded, ...Array<string>(metadata.args.length - padded.length).fill("")] : padded;
      return [...positioned, BLOCK_BODY_SENTINEL, ...extras];
    }
    return applyArgDefaults(metadata, [...node.args, BLOCK_BODY_SENTINEL]);
  }
  return applyArgDefaults(metadata, [...node.args]);
}

function validationArguments(node: MacroCallNode | MacroBlockNode, registry: MacroRegistry): readonly string[] {
  const metadata = registry.getMetadata(node.name);
  if (node.type === "block" && registry.getOptions(node.name)?.blockContentAfterDeclaredArgs === true && metadata !== undefined && !metadata.variadic) {
    const declared = applyArgDefaults(metadata, node.args.slice(0, metadata.args.length));
    return [...declared, ...node.args.slice(metadata.args.length)];
  }
  return effectiveArguments(node, registry).filter((arg) => arg !== BLOCK_BODY_SENTINEL);
}

function analyzeArguments(
  node: MacroCallNode | MacroBlockNode,
  registry: MacroRegistry,
  axis: DependencyAxis,
  expansionDepth: number,
  activeExpansions: ReadonlySet<string>,
): AnalysisResult {
  const analysis = registry.getOptions(node.name)?.analysis;
  const args = effectiveArguments(node, registry);
  const contribution = node.type === "block" ? (analysis?.blockArguments ?? analysis?.arguments ?? "all") : (analysis?.arguments ?? "all");
  const consumed = new Set(argumentIndexes(args.length, contribution));
  const lazy = usesLazyArguments(node, registry);
  const lazyEvaluation =
    node.type === "block" ? (analysis?.blockLazyArguments ?? analysis?.lazyArguments ?? contribution) : (analysis?.lazyArguments ?? contribution);
  const evaluated = new Set(argumentIndexes(args.length, lazy ? lazyEvaluation : "all"));
  const results: AnalysisResult[] = [];
  for (const [index, arg] of args.entries()) {
    if (arg === BLOCK_BODY_SENTINEL || !evaluated.has(index)) {
      continue;
    }
    const nested = analyzeAst(parseMacros(arg), registry, axis, expansionDepth, activeExpansions);
    results.push({
      dependsOnTurn: consumed.has(index) && nested.dependsOnTurn,
      // State writes survive even when the handler discards the resulting value. Eager delivery always
      // evaluates every arg; a lazy handler declares the raw args it resolves itself.
      mutatesState: nested.mutatesState,
    });
  }
  return mergeResults(results);
}

function analyzeUnknown(
  node: Exclude<MacroNode, { type: "text" }>,
  registry: MacroRegistry,
  axis: DependencyAxis,
  expansionDepth: number,
  activeExpansions: ReadonlySet<string>,
): AnalysisResult {
  if (node.type === "macro") {
    const bindingDependencies = mergeResults(
      node.args.map((arg) => analyzeNestedBindings(arg, registry, axis, expansionDepth, activeExpansions)),
    );
    // A name-only unknown can resolve from ctx.env. Unknown calls with arguments reconstruct their raw
    // source byte-for-byte and never inspect those arguments.
    return node.args.length === 0
      ? axis === "cache"
        ? { dependsOnTurn: true, mutatesState: false }
        : STATIC_RESULT
      : bindingDependencies;
  }
  // Unknown blocks reconstruct their tags around an evaluated body. Ordinary open-tag args stay inert,
  // but a pre-resolved user binding changes those reconstructed bytes before parsing reaches here.
  return mergeResults([
    ...node.args.map((arg) => analyzeNestedBindings(arg, registry, axis, expansionDepth, activeExpansions)),
    analyzeAst(node.children, registry, axis, expansionDepth, activeExpansions),
  ]);
}

function analyzeIf(
  node: Exclude<MacroNode, { type: "text" }>,
  registry: MacroRegistry,
  axis: DependencyAxis,
  expansionDepth: number,
  activeExpansions: ReadonlySet<string>,
): AnalysisResult {
  const argumentsResult = analyzeArguments(node, registry, axis, expansionDepth, activeExpansions);
  if (node.type === "macro") {
    return argumentsResult;
  }
  const selected = selectStaticIfChildren(node.args, node.children);
  if (selected !== null) {
    return mergeResults([argumentsResult, analyzeAst(selected, registry, axis, expansionDepth, activeExpansions)]);
  }
  const branches = analyzeAst(node.children, registry, axis, expansionDepth, activeExpansions);
  // A predicate that needs MacroContext can select different rendered bytes even when neither branch
  // contains a registered volatile macro. Retain both branches conservatively for their possible writes.
  return { dependsOnTurn: true, mutatesState: argumentsResult.mutatesState || branches.mutatesState };
}

function nodeSource(ast: MacroAST): string {
  let source = "";
  for (const node of ast) {
    if (node.type === "text") {
      source += node.value;
    } else if (node.type === "macro") {
      source += node.raw ?? `{{${node.name}}}`;
    } else {
      source += node.raw ?? `{{${node.name}}}`;
      source += nodeSource(node.children);
      source += node.closeRaw ?? `{{/${node.name}}}`;
    }
  }
  return source;
}

function analyzeKnown(
  node: Exclude<MacroNode, { type: "text" }>,
  registry: MacroRegistry,
  axis: DependencyAxis,
  expansionDepth: number,
  activeExpansions: ReadonlySet<string>,
): AnalysisResult {
  const options = registry.getOptions(node.name);
  const analysis = options?.analysis;
  const declaredDependency =
    axis === "volatile"
      ? node.type === "block"
        ? (analysis?.blockVolatileDependent ?? analysis?.volatileDependent)
        : analysis?.volatileDependent
      : node.type === "block"
        ? (analysis?.blockCacheDependent ?? analysis?.cacheDependent)
        : analysis?.cacheDependent;
  const directDependency = declaredDependency ?? options?.volatile === true;
  const directMutation = analysis?.mutatesState === true;
  if (analysis?.blockBody === "if") {
    const conditional = analyzeIf(node, registry, axis, expansionDepth, activeExpansions);
    return {
      dependsOnTurn: directDependency || conditional.dependsOnTurn,
      mutatesState: directMutation || conditional.mutatesState,
    };
  }

  const argumentsResult = analyzeArguments(node, registry, axis, expansionDepth, activeExpansions);
  const metadata = registry.getMetadata(node.name);
  const strictInvalid = metadata?.strict === true && checkMacroArgs(metadata, validationArguments(node, registry)).length > 0;
  const expanded = strictInvalid
    ? undefined
    : analysis?.expand?.(
        effectiveArguments(node, registry).filter((arg) => arg !== BLOCK_BODY_SENTINEL),
        node.type === "block" ? nodeSource(node.children) : undefined,
      );
  const expansionKey = `${node.name.toLowerCase()}\u0000${expanded ?? ""}`;
  const expandedResult =
    expanded === undefined || activeExpansions.has(expansionKey) || expansionDepth >= MACRO_MAX_DEPTH
      ? STATIC_RESULT
      : analyzeAst(parseMacros(expanded), registry, axis, expansionDepth + 1, new Set([...activeExpansions, expansionKey]));
  if (node.type === "macro") {
    return {
      dependsOnTurn: directDependency || argumentsResult.dependsOnTurn || expandedResult.dependsOnTurn,
      mutatesState: directMutation || argumentsResult.mutatesState || expandedResult.mutatesState,
    };
  }

  const body = analyzeAst(node.children, registry, axis, expansionDepth, activeExpansions);
  const bodyContributes = (analysis?.blockBody ?? "all") === "all";
  return {
    dependsOnTurn: directDependency || argumentsResult.dependsOnTurn || expandedResult.dependsOnTurn || (bodyContributes && body.dependsOnTurn),
    // Universal block delivery evaluates the body before invoking the handler, including handlers that
    // discard the resulting content. Handler-controlled blocks in this analyzer either consume it or
    // explicitly declare `none`; both retain writes only when evaluation actually occurs.
    mutatesState:
      directMutation || argumentsResult.mutatesState || expandedResult.mutatesState || ((options?.blockChildren !== true || bodyContributes) && body.mutatesState),
  };
}

function analyzeAst(
  ast: MacroAST,
  registry: MacroRegistry,
  axis: DependencyAxis,
  expansionDepth = 1,
  activeExpansions: ReadonlySet<string> = new Set(),
): AnalysisResult {
  const results: AnalysisResult[] = [];
  for (const node of ast) {
    if (node.type === "text") {
      results.push(analyzeTextBinding(node.value, axis));
      continue;
    }
    results.push(
      registry.get(node.name) === undefined
        ? analyzeUnknown(node, registry, axis, expansionDepth, activeExpansions)
        : analyzeKnown(node, registry, axis, expansionDepth, activeExpansions),
    );
  }
  return mergeResults(results);
}

/** Whether rendering `text` can change cached-prefix bytes or mutate state that a later prefix read sees. */
export function macroTextInvalidatesCache(text: string, registry: MacroRegistry): boolean {
  const result = analyzeAst(parseMacros(text), registry, "cache");
  return result.dependsOnTurn || result.mutatesState;
}

/** The evaluator-aware volatile scan used while deriving user-macro registration metadata. */
export function macroTextIsVolatile(text: string, registry: MacroRegistry): boolean {
  const result = analyzeAst(parseMacros(text), registry, "volatile");
  return result.dependsOnTurn || result.mutatesState;
}
