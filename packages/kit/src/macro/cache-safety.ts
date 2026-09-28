// Static macro analysis for prompt-prefix cache safety and user-macro volatility. This follows the
// evaluator's execution contract from registry metadata: unknown inline calls keep raw arguments inert,
// unknown blocks render evaluated children, eager arguments execute even when their value is discarded,
// lazy arguments execute only when the handler declares that it resolves them, and block handlers
// declare whether they render, discard, or branch-select their body.

import { applyArgDefaults, checkMacroArgs } from "./metadata.ts";
import { parseMacros } from "./parser.ts";
import { selectStaticIfChildren } from "./registry.ts";
import type { MacroAST, MacroBlockNode, MacroCallNode, MacroNode, MacroRegistry } from "./types.ts";
import { MACRO_MAX_DEPTH } from "./types.ts";

interface AnalysisResult {
  readonly dependsOnTurn: boolean;
  readonly mutatesState: boolean;
}

type DependencyAxis = "cache" | "volatile";

interface AnalysisContext {
  readonly registry: MacroRegistry;
  readonly axis: DependencyAxis;
  readonly expansionDepth: number;
  readonly activeExpansions: ReadonlySet<string>;
}

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

function analyzeNestedBindings(text: string, context: AnalysisContext): AnalysisResult {
  const hasBinding = text.includes(RESOLVED_BINDING) || text.includes(CACHE_BINDING) || text.includes(VOLATILE_BINDING);
  if (!hasBinding) {
    return STATIC_RESULT;
  }
  return analyzeAst(parseMacros(text), context);
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
      const positioned = padded.length < metadata.args.length ? [...padded, ...new Array<string>(metadata.args.length - padded.length).fill("")] : padded;
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

function analyzeArguments(node: MacroCallNode | MacroBlockNode, context: AnalysisContext): AnalysisResult {
  const analysis = context.registry.getOptions(node.name)?.analysis;
  const args = effectiveArguments(node, context.registry);
  const contribution = node.type === "block" ? (analysis?.blockArguments ?? analysis?.arguments ?? "all") : (analysis?.arguments ?? "all");
  const consumed = new Set(argumentIndexes(args.length, contribution));
  const lazy = usesLazyArguments(node, context.registry);
  const lazyEvaluation =
    node.type === "block" ? (analysis?.blockLazyArguments ?? analysis?.lazyArguments ?? contribution) : (analysis?.lazyArguments ?? contribution);
  const evaluated = new Set(argumentIndexes(args.length, lazy ? lazyEvaluation : "all"));
  const results: AnalysisResult[] = [];
  for (const [index, arg] of args.entries()) {
    if (arg === BLOCK_BODY_SENTINEL || !evaluated.has(index)) {
      continue;
    }
    const nested = analyzeAst(parseMacros(arg), context);
    results.push({
      dependsOnTurn: consumed.has(index) && nested.dependsOnTurn,
      // State writes survive even when the handler discards the resulting value. Eager delivery always
      // evaluates every arg; a lazy handler declares the raw args it resolves itself.
      mutatesState: nested.mutatesState,
    });
  }
  return mergeResults(results);
}

function analyzeUnknown(node: Exclude<MacroNode, { type: "text" }>, context: AnalysisContext): AnalysisResult {
  if (node.type === "macro") {
    const bindingDependencies = mergeResults(node.args.map((arg) => analyzeNestedBindings(arg, context)));
    // A name-only unknown can resolve from ctx.env. Unknown calls with arguments reconstruct their raw
    // source byte-for-byte and never inspect those arguments.
    if (node.args.length > 0) {
      return bindingDependencies;
    }
    return context.axis === "cache" ? { dependsOnTurn: true, mutatesState: false } : STATIC_RESULT;
  }
  // Unknown blocks reconstruct their tags around an evaluated body. Ordinary open-tag args stay inert,
  // but a pre-resolved user binding changes those reconstructed bytes before parsing reaches here.
  return mergeResults([...node.args.map((arg) => analyzeNestedBindings(arg, context)), analyzeAst(node.children, context)]);
}

function analyzeIf(node: Exclude<MacroNode, { type: "text" }>, context: AnalysisContext): AnalysisResult {
  const argumentsResult = analyzeArguments(node, context);
  if (node.type === "macro") {
    return argumentsResult;
  }
  const selected = selectStaticIfChildren(node.args, node.children);
  if (selected !== null) {
    return mergeResults([argumentsResult, analyzeAst(selected, context)]);
  }
  const branches = analyzeAst(node.children, context);
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

function declaredDependency(node: Exclude<MacroNode, { type: "text" }>, context: AnalysisContext): boolean {
  const options = context.registry.getOptions(node.name);
  const analysis = options?.analysis;
  if (context.axis === "volatile") {
    const declared = node.type === "block" ? (analysis?.blockVolatileDependent ?? analysis?.volatileDependent) : analysis?.volatileDependent;
    return declared ?? options?.volatile === true;
  }
  const declared = node.type === "block" ? (analysis?.blockCacheDependent ?? analysis?.cacheDependent) : analysis?.cacheDependent;
  return declared ?? options?.volatile === true;
}

function expandedSource(node: Exclude<MacroNode, { type: "text" }>, context: AnalysisContext): string | undefined {
  const metadata = context.registry.getMetadata(node.name);
  if (metadata?.strict === true && checkMacroArgs(metadata, validationArguments(node, context.registry)).length > 0) {
    return;
  }
  const args = effectiveArguments(node, context.registry).filter((arg) => arg !== BLOCK_BODY_SENTINEL);
  const blockContent = node.type === "block" ? nodeSource(node.children) : undefined;
  return context.registry.getOptions(node.name)?.analysis?.expand?.(args, blockContent);
}

function analyzeExpansion(node: Exclude<MacroNode, { type: "text" }>, context: AnalysisContext): AnalysisResult {
  const expanded = expandedSource(node, context);
  if (expanded === undefined || context.expansionDepth >= MACRO_MAX_DEPTH) {
    return STATIC_RESULT;
  }
  const expansionKey = `${node.name.toLowerCase()}\u0000${expanded}`;
  if (context.activeExpansions.has(expansionKey)) {
    return STATIC_RESULT;
  }
  return analyzeAst(parseMacros(expanded), {
    ...context,
    expansionDepth: context.expansionDepth + 1,
    activeExpansions: new Set([...context.activeExpansions, expansionKey]),
  });
}

function addDirectFacts(dependency: boolean, mutation: boolean, result: AnalysisResult): AnalysisResult {
  return {
    dependsOnTurn: dependency || result.dependsOnTurn,
    mutatesState: mutation || result.mutatesState,
  };
}

function analyzeKnown(node: Exclude<MacroNode, { type: "text" }>, context: AnalysisContext): AnalysisResult {
  const options = context.registry.getOptions(node.name);
  const analysis = options?.analysis;
  const dependency = declaredDependency(node, context);
  const mutation = analysis?.mutatesState === true;
  if (analysis?.blockBody === "if") {
    return addDirectFacts(dependency, mutation, analyzeIf(node, context));
  }

  const argumentsResult = analyzeArguments(node, context);
  const expandedResult = analyzeExpansion(node, context);
  if (node.type === "macro") {
    return addDirectFacts(dependency, mutation, mergeResults([argumentsResult, expandedResult]));
  }

  const body = analyzeAst(node.children, context);
  const bodyContributes = (analysis?.blockBody ?? "all") === "all";
  return {
    dependsOnTurn: dependency || argumentsResult.dependsOnTurn || expandedResult.dependsOnTurn || (bodyContributes && body.dependsOnTurn),
    // Universal block delivery evaluates the body before invoking the handler, including handlers that
    // discard the resulting content. Handler-controlled blocks retain writes only when evaluation occurs.
    mutatesState:
      mutation || argumentsResult.mutatesState || expandedResult.mutatesState || ((options?.blockChildren !== true || bodyContributes) && body.mutatesState),
  };
}

function analyzeAst(ast: MacroAST, context: AnalysisContext): AnalysisResult {
  const results: AnalysisResult[] = [];
  for (const node of ast) {
    if (node.type === "text") {
      results.push(analyzeTextBinding(node.value, context.axis));
      continue;
    }
    results.push(context.registry.get(node.name) === undefined ? analyzeUnknown(node, context) : analyzeKnown(node, context));
  }
  return mergeResults(results);
}

/** Whether rendering `text` can change cached-prefix bytes or mutate state that a later prefix read sees. */
export function macroTextInvalidatesCache(text: string, registry: MacroRegistry): boolean {
  const result = analyzeAst(parseMacros(text), { registry, axis: "cache", expansionDepth: 1, activeExpansions: new Set() });
  return result.dependsOnTurn || result.mutatesState;
}

/** The evaluator-aware volatile scan used while deriving user-macro registration metadata. */
export function macroTextIsVolatile(text: string, registry: MacroRegistry): boolean {
  const result = analyzeAst(parseMacros(text), { registry, axis: "volatile", expansionDepth: 1, activeExpansions: new Set() });
  return result.dependsOnTurn || result.mutatesState;
}
