import type { MacroAST, MacroBlockNode, MacroCallNode, MacroContext, MacroEnv, MacroRegistry } from "./types";

/** Resolve an env entry by name, exact-case first then case-insensitively (registry parity).
 *  Returns the stringified value (null/undefined → ""), or `undefined` when no key matches so
 *  the caller can fall through to the literal-passthrough. A case-fold COLLISION (env has both
 *  `pov` and `POV`) resolves to whichever the exact-case branch caught, else the first
 *  insertion-order match — deterministic and vanishingly rare for ChoiceBlock names. */
function lookupEnvCI(env: MacroEnv, name: string): string | undefined {
  if (Object.hasOwn(env, name)) {
    return String(env[name] ?? "");
  }
  const lower = name.toLowerCase();
  const matchKey = Object.keys(env).find((key) => key.toLowerCase() === lower);
  // Return the (undefined) `matchKey` itself rather than a literal `undefined` on a miss — same
  // value, and it keeps the single-expression return readable.
  return matchKey === undefined ? matchKey : String(env[matchKey] ?? "");
}

// Resolve a macro argument only if it actually contains a sub-macro (the common arg is plain text).
function resolveArg(arg: string, ctx: MacroContext): string {
  return arg.includes("{{") ? ctx.evaluateString(arg) : arg;
}

// Re-emit an unrecognized inline/block macro as TYPED. `node.raw` is the original source span;
// reconstructing from parsed args normalized `{{x:one,two}}` → `{{x::one::two}}`, changing
// passthrough bytes (review V10-10). Fallback reconstruction only for hand-built AST nodes that
// lack `raw`. `openMarker` is "{{" for inline, "{{#" for a block open tag.
function reconstruct(name: string, args: string[], raw: string | undefined, openMarker: string): string {
  const argSuffix = args.length > 0 ? `::${args.join("::")}` : "";
  return raw ?? `${openMarker}${name}${argSuffix}}}`;
}

function evalMacroNode(node: MacroCallNode, registry: MacroRegistry, ctx: MacroContext): string {
  const handler = registry.get(node.name);
  if (handler) {
    const resolvedArgs = node.args.map((arg) => resolveArg(arg, ctx));
    try {
      const val = handler(resolvedArgs, ctx);
      return ctx.postProcess ? ctx.postProcess(val) : val;
    } catch (err) {
      // Fail-open POLICY: ALL handler errors degrade the macro to a literal `{{name}}` (and surface
      // the cause via onWarn). This is intentional, not a bug-swallow — a card author shouldn't be
      // able to crash a turn by writing a bad macro. The trade-off: a typo in a BUILT-IN handler
      // gets the same treatment, so review onWarn output when adding/changing a built-in.
      ctx.onWarn?.(`[Macro Engine] Error evaluating macro ${node.name}`, err);
      return `{{${node.name}}}`;
    }
  }
  // No handler registered — catch-all: an argument-less `{{NAME}}` whose name matches a key in
  // ctx.env resolves to that value directly. This is what makes a ChoiceBlock variable named "POV"
  // usable as `{{POV}}` without `{{getvar::POV}}`. Lookup is CASE-INSENSITIVE to match the registry.
  // Giving args (for an unregistered name) bypasses the env lookup — it's name-only.
  const envVal = lookupEnvCI(ctx.env, node.name);
  if (node.args.length === 0 && envVal !== undefined) {
    return ctx.postProcess ? ctx.postProcess(envVal) : envVal;
  }
  return reconstruct(node.name, node.args, node.raw, "{{");
}

function evalBlockNode(node: MacroBlockNode, registry: MacroRegistry, ctx: MacroContext): string {
  const handler = registry.get(node.name);
  if (handler) {
    // `delayArgResolution: true` lets handlers like `if` distinguish a bare identifier from a
    // resolved sub-macro by reading the unresolved arg themselves.
    const opts = registry.getOptions(node.name);
    const resolvedArgs = opts?.delayArgResolution === true ? node.args : node.args.map((arg) => resolveArg(arg, ctx));
    try {
      const val = handler(resolvedArgs, ctx, node.children);
      return ctx.postProcess ? ctx.postProcess(val) : val;
    } catch (err) {
      ctx.onWarn?.(`[Macro Engine] Error evaluating block ${node.name}`, err);
      return `{{#${node.name}}}`;
    }
  }
  // Unrecognized block — preserve the wrapper + recurse into children. Route the child evaluation
  // through ctx.evaluateAST so the depth guard (index.ts) fires; the direct `evaluateMacros` call
  // would skip it and a deeply nested unknown-block tree could blow the stack before the output
  // budget tripped. The open tag re-emits the ORIGINAL source span (review V10-10).
  const open = reconstruct(node.name, node.args, node.raw, "{{#");
  return `${open}${ctx.evaluateAST(node.children)}{{/${node.name}}}`;
}

export function evaluateMacros(ast: MacroAST, registry: MacroRegistry, ctx: MacroContext): string {
  let result = "";
  const budget = ctx.__budget;
  // Output-bytes cap. Charged on every append; once tripped, every subsequent append no-ops via the
  // same flag. Single onWarn per render.
  const append = (chunk: string): void => {
    if (!budget) {
      result += chunk;
      return;
    }
    if (budget.tripped) {
      return;
    }
    budget.output += chunk.length;
    if (budget.output > budget.maxOutput) {
      budget.tripped = true;
      ctx.onWarn?.(`[Macro Engine] output limit ${budget.maxOutput} bytes exceeded — truncated`);
      return;
    }
    result += chunk;
  };

  for (const node of ast) {
    if (budget?.tripped === true) {
      break;
    }
    if (node.type === "text") {
      append(node.value);
    } else if (node.type === "macro") {
      append(evalMacroNode(node, registry, ctx));
    } else {
      append(evalBlockNode(node, registry, ctx));
    }
  }

  return result;
}
