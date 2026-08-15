import { applyArgDefaults, checkMacroArgs, macroArgDiagnostics } from "./metadata.ts";
import type { MacroAST, MacroBlockNode, MacroCallNode, MacroContext, MacroEnv, MacroFlags, MacroHandler, MacroMetadata, MacroRegistry } from "./types.ts";
import { MACRO_FLAG_DEFS } from "./types.ts";

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

// The flag chars of a node's parsed flags, in the vocabulary's canonical order — the `raw`-less
// reconstruction fallback only (`closing` never sits on an AST node; skip it defensively anyway).
function flagString(flags: MacroFlags | undefined): string {
  if (flags === undefined) {
    return "";
  }
  let out = "";
  for (const def of MACRO_FLAG_DEFS) {
    if (def.key !== "closing" && flags[def.key] === true) {
      out += def.char;
    }
  }
  return out;
}

// Re-emit an unrecognized inline/block-open macro as TYPED. `raw` is the original source span —
// reconstructing from parsed args normalized `{{x:one,two}}` → `{{x::one::two}}`, changing
// passthrough bytes (review V10-10); the raw path also carries the flag run verbatim.
// Fallback reconstruction only for hand-built AST nodes that lack `raw`.
function reconstruct(name: string, args: string[], raw: string | undefined, flags: MacroFlags | undefined): string {
  const argSuffix = args.length > 0 ? `::${args.join("::")}` : "";
  return raw ?? `{{${flagString(flags)}${name}${argSuffix}}}`;
}

// The per-call arg-resolution mode: the `!` (IMMEDIATE) / `?` (DELAYED) flags override the
// handler's declared `delayArgResolution` default. A conflicting `{{!?…}}` run resolves IMMEDIATE —
// eager delivery is safe for every handler, while a lazy delivery to a lazy-unaware handler passes raw
// bytes through. A lazy delivery hands the handler its RAW args; the handler resolves what it needs via
// ctx.resolve (same PRNG/opLog/budget, so document-order draws survive the deferral — the
// determinism-through-nesting invariant).
function lazyArgs(node: MacroCallNode | MacroBlockNode, registry: MacroRegistry): boolean {
  if (node.flags?.immediate === true) {
    return false;
  }
  if (node.flags?.delayed === true) {
    return true;
  }
  return registry.getOptions(node.name)?.delayArgResolution === true;
}

// One recognized call's delivered-arg shape, bundled for checkArgs (parameter-count discipline).
// `contentArgs` = how many trailing args are a scoped-block BODY (0 inline, 1 universal-block) — block
// capability is universal, so the body slot must never trip the too-many arity check.
interface DeliveredCall {
  readonly node: MacroCallNode | MacroBlockNode;
  readonly args: string[];
  readonly contentArgs: number;
}

// Runtime enforcement: check the DELIVERED args against the macro's declared contract, push
// diagnostics to the optional sink, and — under strict (ctx.strictArgs OR the metadata's per-macro
// `strict`) — signal "render empty" when there's a violation. STRICT-AUTHOR / LENIENT-RENDER (the D2
// posture): a violation never throws — lenient renders best-effort, strict degrades to "" (the author
// already got the diagnostic at write time; a stale template can't abort a live turn). No-op when the
// macro has no metadata (the restricted registries); the diagnostic additionally needs a span.
function checkArgs(ctx: MacroContext, meta: MacroMetadata | undefined, call: DeliveredCall): boolean {
  if (meta === undefined) {
    return false;
  }
  const strict = ctx.strictArgs === true || meta.strict === true;
  const violations = checkMacroArgs(meta, call.args, { contentArgs: call.contentArgs });
  if (violations.length === 0) {
    return false;
  }
  if (ctx.diagnostics !== undefined && call.node.span !== undefined) {
    ctx.diagnostics.push(...macroArgDiagnostics(violations, call.node.span, strict));
  }
  return strict;
}

// A recognized INLINE call: deliver args per the call's eager/lazy mode, pad declared defaults, enforce
// the typed-arg contract, invoke. Strict-mode violation → render "" (the editors hold new authorship to
// the bar); lenient → diagnostics recorded, best-effort render proceeds. The still-reserved flags
// (`~`/`>`, and `#` on an inline call) are parse-and-carry NO-OPS — the call evaluates as if
// unflagged.
function evalKnownCall(handler: MacroHandler, node: MacroCallNode, registry: MacroRegistry, ctx: MacroContext): string {
  const delivered = lazyArgs(node, registry) ? [...node.args] : node.args.map((arg) => resolveArg(arg, ctx));
  const meta = registry.getMetadata(node.name);
  const padded = applyArgDefaults(meta, delivered);
  if (checkArgs(ctx, meta, { node, args: padded, contentArgs: 0 })) {
    return "";
  }
  // Locate the handler at its call span so a diagnostic-emitting handler ({{expr::…}}) can attach it.
  ctx.__currentSpan = node.span;
  try {
    const val = handler(padded, ctx);
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

function evalMacroNode(node: MacroCallNode, registry: MacroRegistry, ctx: MacroContext): string {
  const handler = registry.get(node.name);
  if (handler) {
    return evalKnownCall(handler, node, registry, ctx);
  }
  // No handler registered — catch-all: an argument-less `{{NAME}}` whose name matches a key in
  // ctx.env resolves to that value directly. This is what makes a ChoiceBlock variable named "POV"
  // usable as `{{POV}}` without `{{getvar::POV}}`. Lookup is CASE-INSENSITIVE to match the registry.
  // Giving args (for an unregistered name) bypasses the env lookup — it's name-only.
  const envVal = lookupEnvCI(ctx.env, node.name);
  if (node.args.length === 0 && envVal !== undefined) {
    return ctx.postProcess ? ctx.postProcess(envVal) : envVal;
  }
  // Genuinely unknown macro — record a diagnostic (sink-only; the byte-identical passthrough render is
  // unchanged, so stored-history re-emit + editor squiggles coexist). No span ⇒ hand-built node, skip.
  if (ctx.diagnostics !== undefined && node.span !== undefined) {
    ctx.diagnostics.push({
      severity: ctx.strictArgs === true ? "error" : "warning",
      code: "unknown-macro",
      message: `unknown macro {{${node.name}}}`,
      span: node.span,
    });
  }
  return reconstruct(node.name, node.args, node.raw, node.flags);
}

// A recognized macro in scoped-block form. Two delivery modes:
//   • `blockChildren` registrations (`if`, the trim/case-fold family) receive the RAW body AST and
//     control resolution themselves (branch-picking, whole-body transforms) — the `!`/`?` flags flip
//     only the ARG axis, never this body delivery (an eager-forced `{{!if}}` still branch-picks);
//   • every OTHER macro (the universal default) gets the body resolved through ctx.resolve (the
//     evaluateAST seam — depth guard + budget fire; a body never escapes the MacroBudget), trimmed +
//     indent-dedented (verbatim under the `#` PRESERVE_WHITESPACE flag), appended as its LAST unnamed
//     argument. Declared defaults pad AFTER the body lands (the body is a real positional arg).
function evalKnownBlock(handler: MacroHandler, node: MacroBlockNode, registry: MacroRegistry, ctx: MacroContext): string {
  const meta = registry.getMetadata(node.name);
  const resolvedArgs = lazyArgs(node, registry) ? [...node.args] : node.args.map((arg) => resolveArg(arg, ctx));
  ctx.__currentSpan = node.span;
  try {
    if (registry.getOptions(node.name)?.blockChildren === true) {
      const padded = applyArgDefaults(meta, resolvedArgs);
      if (checkArgs(ctx, meta, { node, args: padded, contentArgs: 0 })) {
        return "";
      }
      const val = handler(padded, ctx, node.children);
      return ctx.postProcess ? ctx.postProcess(val) : val;
    }
    const content = ctx.resolve(node.children, { trim: node.flags?.preserveWhitespace !== true });
    const padded = applyArgDefaults(meta, [...resolvedArgs, content]);
    if (checkArgs(ctx, meta, { node, args: padded, contentArgs: 1 })) {
      return "";
    }
    const val = handler(padded, ctx);
    return ctx.postProcess ? ctx.postProcess(val) : val;
  } catch (err) {
    // Same fail-open policy as inline calls: degrade to the OPEN tag's literal bytes, body dropped.
    ctx.onWarn?.(`[Macro Engine] Error evaluating block ${node.name}`, err);
    return reconstruct(node.name, node.args, node.raw, node.flags);
  }
}

function evalBlockNode(node: MacroBlockNode, registry: MacroRegistry, ctx: MacroContext): string {
  const handler = registry.get(node.name);
  if (handler) {
    return evalKnownBlock(handler, node, registry, ctx);
  }
  // Unrecognized block — re-emit BOTH tags from their original bytes (flags verbatim) + recurse into
  // children. Route the child evaluation through ctx.evaluateAST so the depth guard (engine.ts) fires;
  // the direct `evaluateMacros` call would skip it and a deeply nested unknown-block tree could blow
  // the stack before the output budget tripped. (Review V10-10: raw spans, never normalized args.)
  const open = reconstruct(node.name, node.args, node.raw, node.flags);
  const close = node.closeRaw ?? `{{/${node.name}}}`;
  return `${open}${ctx.evaluateAST(node.children)}${close}`;
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
