// Hand-written values in TS and TSX: whole-string CSS values, media conditions, and the timing and measurement constants that name them.
import ts from "typescript";
import type { Hit, Judgement, Lit, Place, Source, ValueTokens } from "../eslint/index.ts";
import { conditionStringLits, hitOf, judgeLit, keepJudgement, lineOf, lit, QUERY_PROPERTY, tokensHolding, unwrap, valueStringLits } from "../eslint/index.ts";
import { numberOf, staticTemplate } from "./syntax.ts";

const MAX_STRING = 120;
const REM_PX = 16;
const MS_PER_SECOND = 1000;
const MIN_REPEATS = 2;
const MIN_REPEAT_FILES = 2;
// A class attribute and a style prop are read by their own passes; a module specifier is not a value.
const CLASS_OR_STYLE_ATTRIBUTE = /^(?:className|style|[a-z][A-Za-z]*ClassName)$/u;
const UNIT_WORDS: Readonly<Record<string, "ms" | "s" | "px" | "rem">> = { ms: "ms", sec: "s", seconds: "s", px: "px", rem: "rem" };
// A timer is read as a bare call or as a member (`globalThis.setTimeout`); a timing hook is named for what it waits on.
const TIMER_CALLEES: ReadonlySet<string> = new Set(["setTimeout", "setInterval", "debounce", "throttle"]);
const TIMING_HOOK = /^use(?:[A-Z]\w*?)?(?:Debounced?|Throttled?|Interval|Timeout|Delay(?:ed)?)(?:[A-Z]\w*)?$/u;
const DELAY_WORDS: ReadonlySet<string> = new Set(["delay", "duration", "timeout", "interval"]);
const SENTINEL_WORDS: ReadonlySet<string> = new Set(["sentinel", "sentinels"]);
// A constant named for the browser's own control (`FALLBACK_NATIVE_HEX`) holds what that control's value grammar takes.
const NATIVE_WORDS: ReadonlySet<string> = new Set(["native"]);
const ANIMATION_WORDS: ReadonlySet<string> = new Set(["anim", "animation", "transition", "fade", "duration", "flash", "pulse", "slide", "tween", "count"]);

export interface Constant {
  readonly name: string;
  readonly words: readonly string[];
  /** The last concept word of the name, so two constants for one concept share it: `SEARCH_DEBOUNCE_MS` is `debounce`. */
  readonly word: string;
  readonly unit: "ms" | "s" | "px" | "rem";
  readonly found: Lit;
  readonly place: Place;
  /** The timer or hook a delay is handed to; null for a declared constant or a prop. */
  readonly callee: string | null;
  readonly where: "constant" | "timer" | "prop";
}

interface Reader {
  readonly source: Source;
  readonly sf: ts.SourceFile;
}

const placeOf = ({ source, sf }: Reader, node: ts.Node): Place => ({ path: source.path, line: lineOf(sf, node), section: source.section, layer: source.layer });

interface StringNode {
  readonly node: ts.Node;
  readonly text: string;
}

function stringNodes(sf: ts.SourceFile): readonly StringNode[] {
  const out: StringNode[] = [];
  const read = (node: ts.Node): void => {
    const skipped =
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isLiteralTypeNode(node) ||
      ts.isImportTypeNode(node) ||
      (ts.isJsxAttribute(node) && CLASS_OR_STYLE_ATTRIBUTE.test(node.name.getText(sf)));
    if (skipped) {
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push({ node, text: node.text });
    }
    const built = ts.isTemplateExpression(node) ? staticTemplate(node) : null;
    if (built !== null) {
      out.push({ node, text: built });
      return;
    }
    ts.forEachChild(node, read);
  };
  read(sf);
  return out;
}

/** The literals of a string that is a CSS value or a condition on its own; a longer or digit-free string is prose. */
function stringLits(text: string): readonly Lit[] {
  if (text.length > MAX_STRING || !/[\d#]/u.test(text)) {
    return [];
  }
  return text.startsWith("(") ? conditionStringLits(text) : valueStringLits(text);
}

/** The keep the name of the declaration a string sits in settles: a sentinel, or a value for the browser's own control. */
function declaredKeep(node: ts.Node): "sentinel" | "dom-api-literal" | null {
  for (let parent = node.parent; !ts.isSourceFile(parent); parent = parent.parent) {
    const name = ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) ? parent.name : undefined;
    if (name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))) {
      const words = wordsOf(name.text);
      if (words.some((word) => SENTINEL_WORDS.has(word))) {
        return "sentinel";
      }
      return words.some((word) => NATIVE_WORDS.has(word)) ? "dom-api-literal" : null;
    }
  }
  return null;
}

function stringHits(reader: Reader, tokens: ValueTokens): readonly Hit[] {
  return stringNodes(reader.sf).flatMap(({ node, text: written }) => {
    const text = written.trim();
    const condition = text.startsWith("(");
    return stringLits(text).map((found) => {
      const kept = declaredKeep(node);
      const judgement = kept === null ? judgeLit(found, condition ? QUERY_PROPERTY : null, tokens) : keepJudgement(kept, found.text);
      const category = judgement.match === null ? "raw-value" : "token-literal";
      return hitOf(placeOf(reader, node), { category, where: condition ? "query" : "string", detail: `"${text}"` }, judgement);
    });
  });
}

/** Words of an identifier, lower-cased: `SEARCH_DEBOUNCE_MS` and `searchDebounceMs` both read search, debounce, ms. */
function wordsOf(name: string): readonly string[] {
  return name
    .split(/_|(?<=[a-z0-9])(?=[A-Z])/u)
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());
}

function constantLit(unit: Constant["unit"], amount: number): Lit {
  if (unit === "ms" || unit === "s") {
    return lit("duration", `${amount * (unit === "s" ? MS_PER_SECOND : 1)}ms`);
  }
  return lit("length", `${amount * (unit === "rem" ? REM_PX : 1)}px`);
}

function unitOf(words: readonly string[]): Constant["unit"] | undefined {
  // `PER_SEC` names a rate, not a duration.
  return words.at(-2) === "per" ? undefined : UNIT_WORDS[words.at(-1) ?? ""];
}

function constantOf(reader: Reader, name: string, expression: ts.Expression, node: ts.Node): Constant | null {
  const words = wordsOf(name);
  const unit = unitOf(words);
  const amount = numberOf(expression);
  if (unit === undefined || amount === null || amount <= 0) {
    return null;
  }
  return { name, callee: null, words, word: words.at(-2) ?? name, unit, found: constantLit(unit, amount), place: placeOf(reader, node), where: "constant" };
}

/** The number a delay or measure argument writes, and the const it reads it through; a unit-named const is the constant pass's, so it is null here. */
function delayOf(expression: ts.Expression): { readonly amount: number; readonly via: string | null } | null {
  const node = unwrap(expression);
  const via = ts.isIdentifier(node) ? node.text : null;
  if (via !== null && unitOf(wordsOf(via)) !== undefined) {
    return null;
  }
  const amount = numberOf(node, true);
  return amount === null || amount <= 0 ? null : { amount, via };
}

/** A delay a timer or a timing hook takes as its second argument: a literal, or a same-file const named without a unit word. */
function timerOf(reader: Reader, call: ts.CallExpression): Constant | null {
  const callee = calleeName(call.expression);
  const delay = call.arguments[1];
  const found = callee === null || delay === undefined || !(TIMER_CALLEES.has(callee) || TIMING_HOOK.test(callee)) ? null : delayOf(delay);
  if (callee === null || found === null) {
    return null;
  }
  const name = found.via ?? callee;
  const words = wordsOf(name);
  return { name, callee, words, word: words.at(-1) ?? name, unit: "ms", found: constantLit("ms", found.amount), place: placeOf(reader, call), where: "timer" };
}

/** A number on a JSX prop whose name ends in a unit word or a timing word: `fallbackDelay={300}`, `thumbPx={24}`. */
function propOf(reader: Reader, attribute: ts.JsxAttribute): Constant | null {
  const init = attribute.initializer;
  const name = attribute.name.getText(reader.sf);
  const words = wordsOf(name);
  const unit = unitOf(words) ?? (DELAY_WORDS.has(words.at(-1) ?? "") ? "ms" : undefined);
  const found = unit === undefined || init === undefined || !ts.isJsxExpression(init) || init.expression === undefined ? null : delayOf(init.expression);
  if (unit === undefined || found === null) {
    return null;
  }
  return {
    name,
    callee: null,
    words,
    word: words.at(-2) ?? name,
    unit,
    found: constantLit(unit, found.amount),
    place: placeOf(reader, attribute),
    where: "prop",
  };
}

const calleeName = (callee: ts.Expression): string | null => {
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
};

function declaredConstant(reader: Reader, node: ts.Node): Constant | null {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
    return constantOf(reader, node.name.text, node.initializer, node);
  }
  if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
    return constantOf(reader, node.name.text, node.initializer, node);
  }
  if (ts.isJsxAttribute(node)) {
    return propOf(reader, node);
  }
  return ts.isCallExpression(node) ? timerOf(reader, node) : null;
}

export interface CodeFindings {
  readonly hits: readonly Hit[];
  readonly constants: readonly Constant[];
}

/** The whole-string values a TS or TSX file writes, and the unit-named constants and timer delays it declares. */
export function codeFindings(source: Source, tokens: ValueTokens): CodeFindings {
  const sf = source.sf;
  if (sf === null) {
    return { hits: [], constants: [] };
  }
  const reader = { source, sf };
  const constants: Constant[] = [];
  const visit = (node: ts.Node): void => {
    const found = declaredConstant(reader, node);
    if (found !== null) {
      constants.push(found);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { hits: stringHits(reader, tokens), constants };
}

const groupKey = (constant: Constant): string => `${constant.found.canon}|${constant.word}`;

// Constants read and found to share a number and not a meaning. A group with any other member is a repeat again, so a new constant is judged.
const COINCIDENT_CONSTANTS: readonly (readonly [why: string, names: ReadonlySet<string>])[] = [
  ["one polls an embedder rebuild, one polls a live share", new Set(["REBUILD_POLL_MS", "LIVE_POLL_MS"])],
  ["one reaps an idle temp chat, one waits for an idle warmup", new Set(["REAP_IDLE_TIMEOUT_MS", "IDLE_WARMUP_TIMEOUT_MS"])],
  ["one waits out a rerank, one waits out an edited draft", new Set(["RERANK_SETTLE_MS", "SCHEMA_PLAN_SETTLE_MS"])],
  ["one revokes a download URL, one is a blur-close guard", new Set(["REVOKE_DELAY_MS", "BLUR_CLOSE_DELAY_MS"])],
  ["one is the scroll-edge slack, one is the band inside which a persisted height is not rewritten", new Set(["SCROLL_EDGE_EPSILON_PX", "WRITE_EPSILON_PX"])],
];

const coincidenceOf = (repeats: readonly Constant[]): string | undefined =>
  COINCIDENT_CONSTANTS.find(([, names]) => repeats.every((entry) => names.has(entry.name)))?.[0];

function constantJudgement(
  constant: Constant,
  repeats: readonly Constant[],
  tokens: ValueTokens,
): { readonly judgement: Judgement; readonly category: Hit["category"] } {
  // An equal number is a coincidence unless the name says the constant times an animation.
  const animates = constant.words.some((word) => ANIMATION_WORDS.has(word));
  const names = constant.found.kind === "duration" && animates ? tokensHolding(tokens, constant.found, ["motion"]) : [];
  const first = names[0];
  if (first !== undefined) {
    return {
      category: "token-literal",
      judgement: {
        verdict: "token",
        match: names.join(" or "),
        owner: first,
        reason: `${first} holds ${constant.found.canon}, and ${constant.name} names an animation`,
        keep: null,
      },
    };
  }
  const files = new Set(repeats.map((entry) => entry.place.path)).size;
  const coincidence = coincidenceOf(repeats);
  if (coincidence !== undefined) {
    return { category: "raw-value", judgement: keepJudgement("coincident-number", `${constant.name}: ${coincidence}`) };
  }
  if (repeats.length >= MIN_REPEATS && files >= MIN_REPEAT_FILES) {
    return {
      category: "repeated-constant",
      judgement: {
        verdict: "decide",
        match: null,
        owner: `constant: ${constant.found.canon} ${constant.word}`,
        reason: `${repeats.length} constants in ${files} files write ${constant.found.canon} for ${constant.word}; one named constant needs a home`,
        keep: null,
      },
    };
  }
  return { category: "raw-value", judgement: keepJudgement("single-constant", `${constant.name} = ${constant.found.canon}`) };
}

function constantDetail({ name, callee, found, where }: Constant): string {
  if (where === "prop") {
    return `${name}={${found.canon}}`;
  }
  if (callee === null) {
    return `${name} = ${found.canon}`;
  }
  return `${callee}(…, ${name === callee ? "" : `${name} = `}${found.canon})`;
}

/** A timing constant that equals a motion token, a value several constants repeat, or neither. */
export function constantHits(constants: readonly Constant[], tokens: ValueTokens): readonly Hit[] {
  const groups = new Map<string, Constant[]>();
  for (const constant of constants) {
    groups.set(groupKey(constant), [...(groups.get(groupKey(constant)) ?? []), constant]);
  }
  return constants.map((constant) => {
    const { judgement, category } = constantJudgement(constant, groups.get(groupKey(constant)) ?? [], tokens);
    const detail = constantDetail(constant);
    return hitOf(constant.place, { category, where: constant.where, detail }, judgement);
  });
}
