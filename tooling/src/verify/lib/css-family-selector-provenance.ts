// CSS selector lexical provenance for hooks and shell roots. Attribute bodies are consumed as one token,
// so class-looking text inside an attribute value never becomes a class selector.

import type { CssSelectorHookFact } from "../contract/resource-css.ts";
import { blankCssComments } from "./comment-spans.ts";
import { KEYFRAME_STEP_RE } from "./css-family-census.ts";
import { splitSelectorList } from "./css-rules.ts";

export interface SelectorAttributeHook {
  readonly open: number;
  readonly close: number;
  readonly name: string;
  readonly operator: "presence" | "=" | "^=" | "$=" | "*=" | "~=" | "|=";
  readonly value: string | undefined;
}

function selectorAttributeAt(selector: string, open: number): SelectorAttributeHook | undefined {
  const close = matchingBracket(selector, open);
  if (close === -1) {
    return;
  }
  const content = selector.slice(open + 1, close);
  const match = /^\s*([_a-zA-Z][\w-]*)(?:\s*([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/u.exec(content);
  const name = match?.[1];
  if (name === undefined) {
    return;
  }
  const operator = (match?.[2] ?? "presence") as SelectorAttributeHook["operator"];
  return { open, close, name, operator, value: match?.[3] ?? match?.[4] ?? match?.[5] };
}

export interface SelectorClassHook {
  readonly name: string;
  readonly offset: number;
}

function recordSelectorAttribute(hooks: Set<string>, attribute: SelectorAttributeHook): void {
  if (attribute.name === "data-slot" && attribute.value !== undefined) {
    hooks.add(`slot:${attribute.value}`);
  }
  if (attribute.name.startsWith("data-shell-")) {
    hooks.add(`attr:${attribute.name}`);
  }
}

/** Every authored data-attribute selector identity. Attribute prose stays one lexical token. */
export function selectorDataAttributes(selector: string): readonly SelectorAttributeHook[] {
  const hooks: SelectorAttributeHook[] = [];
  for (let index = 0; index < selector.length; index += 1) {
    if (selector[index] !== "[") {
      continue;
    }
    const attribute = selectorAttributeAt(selector, index);
    if (attribute === undefined) {
      break;
    }
    if (attribute.name.startsWith("data-")) {
      hooks.push(attribute);
    }
    index = attribute.close;
  }
  return hooks;
}

/** Every class selector identity with its exact dot offset. Attribute bodies remain opaque tokens. */
export function selectorClassHooks(selector: string): readonly SelectorClassHook[] {
  const hooks: SelectorClassHook[] = [];
  for (let index = 0; index < selector.length; index += 1) {
    if (selector[index] === "[") {
      const attribute = selectorAttributeAt(selector, index);
      if (attribute === undefined) {
        break;
      }
      index = attribute.close;
      continue;
    }
    if (selector[index] !== "." || isEscaped(selector, index)) {
      continue;
    }
    const name = classNameAt(selector, index);
    if (name !== undefined) {
      hooks.push({ name, offset: index });
      index += name.length;
    }
  }
  return hooks;
}

function classNameAt(selector: string, dot: number): string | undefined {
  const first = selector[dot + 1] ?? "";
  if (!/[_a-zA-Z]/u.test(first)) {
    return;
  }
  let end = dot + 2;
  while (end < selector.length && /[\w-]/u.test(selector[end] ?? "")) {
    end += 1;
  }
  return selector.slice(dot + 1, end);
}

export function selectorHooks(selector: string): readonly string[] {
  const hooks = new Set<string>();
  for (const classHook of selectorClassHooks(selector)) {
    hooks.add(`class:${classHook.name}`);
  }
  for (let index = 0; index < selector.length; index += 1) {
    if (selector[index] === "[") {
      const attribute = selectorAttributeAt(selector, index);
      if (attribute === undefined) {
        break;
      }
      recordSelectorAttribute(hooks, attribute);
      index = attribute.close;
    }
  }
  return [...hooks];
}

/** ONE authored selector hook, deduplicated across every occurrence in the product corpus.
 *
 *  THE IDENTITY IS THE UNIT OF JUDGEMENT AND OF THE WAIVER. `[data-density="compact"]` written in three
 *  sheets is ONE question ("does anything write it") and must be ONE finding, or a single site is reported
 *  three times and a marker over any one of them leaves the other two effective. The FIRST occurrence in
 *  corpus order anchors it, which is what makes `authored`/`line`/`column` a usable waiver position. */
export interface SelectorHookIdentity {
  readonly kind: "class" | "data";
  readonly name: string;
  readonly operator: SelectorAttributeHook["operator"];
  readonly value: string | undefined;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** The exact authored slice at `(line, column)` — the ordinary waiver position. */
  readonly authored: string;
}

function identityKey(hook: CssSelectorHookFact): string {
  return hook.kind === "class" ? `class:${hook.name}` : `data:${hook.name}:${hook.operator}:${hook.value ?? ""}`;
}

/** Fold the corpus's hook facts into one row per identity, first occurrence winning. */
export function selectorHookIdentities(hooks: readonly CssSelectorHookFact[]): readonly SelectorHookIdentity[] {
  const out = new Map<string, SelectorHookIdentity>();
  for (const hook of hooks) {
    const key = identityKey(hook);
    if (out.has(key)) {
      continue;
    }
    out.set(key, {
      kind: hook.kind,
      name: hook.name,
      operator: hook.kind === "data" ? hook.operator : "presence",
      value: hook.kind === "data" ? hook.value : undefined,
      file: hook.file,
      line: hook.line,
      column: hook.column,
      authored: hook.authored,
    });
  }
  return [...out.values()];
}

/** CSS attribute-selector matching semantics, over the exact value set a writer was proven to emit. The
 *  one home for the operator table: the acquittal (a vendor writes it) and the accusation (nothing does)
 *  must ask the identical question or a hook is both written and missing. */
export function hookValueMatches(operator: SelectorAttributeHook["operator"], expected: string | undefined, values: ReadonlySet<string>): boolean {
  if (operator === "presence") {
    return true;
  }
  if (expected === undefined) {
    return false;
  }
  if (operator === "=") {
    return values.has(expected);
  }
  if (operator === "^=") {
    return [...values].some((value) => value.startsWith(expected));
  }
  if (operator === "$=") {
    return [...values].some((value) => value.endsWith(expected));
  }
  if (operator === "*=") {
    return [...values].some((value) => value.includes(expected));
  }
  if (operator === "~=") {
    return [...values].some((value) => value.split(/\s+/u).includes(expected));
  }
  return [...values].some((value) => value === expected || value.startsWith(`${expected}-`));
}

/** ONE hook of the ownership vocabulary, WITH the authored slice and offset that make it waivable. */
export interface SelectorHookSite {
  /** The ownership vocabulary spelling — `class:x`, `slot:x`, `attr:data-shell-x`. */
  readonly hook: string;
  /** Zero-based offset of the hook's first character INSIDE the selector text. */
  readonly offset: number;
  /** The exact authored slice at `offset` — `.rail`, `[data-slot="dialog"]`, `[data-shell-rail]`. */
  readonly authored: string;
}

/** {@link selectorHooks} with positions. The vocabulary is identical and derived from the same two lexers,
 *  so a hook this returns and a hook `selectorHooks` returns are the same string by construction — the
 *  positions exist because an ORDINARY finding's token must be authored text at its exact coordinate. */
export function selectorHookSites(selector: string): readonly SelectorHookSite[] {
  const sites: SelectorHookSite[] = [];
  for (const classHook of selectorClassHooks(selector)) {
    sites.push({
      hook: `class:${classHook.name}`,
      offset: classHook.offset,
      authored: selector.slice(classHook.offset, classHook.offset + 1 + classHook.name.length),
    });
  }
  for (let index = 0; index < selector.length; index += 1) {
    if (selector[index] !== "[") {
      continue;
    }
    const attribute = selectorAttributeAt(selector, index);
    if (attribute === undefined) {
      break;
    }
    const authored = selector.slice(attribute.open, attribute.close + 1);
    if (attribute.name === "data-slot" && attribute.value !== undefined) {
      sites.push({ hook: `slot:${attribute.value}`, offset: attribute.open, authored });
    }
    if (attribute.name.startsWith("data-shell-")) {
      sites.push({ hook: `attr:${attribute.name}`, offset: attribute.open, authored });
    }
    index = attribute.close;
  }
  return sites;
}

export function hasClientMechanismCarrier(selector: string): boolean {
  return (
    selector.includes("html[data-") || selector.includes(".shell-grid") || selector.includes("[data-has-bg-image]") || selector.includes("[data-reduced-motion")
  );
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

function nextQuote(current: string, char: string, escaped: boolean): string {
  if (current !== "") {
    return char === current && !escaped ? "" : current;
  }
  return char === '"' || char === "'" ? char : "";
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

const SELECTOR_COMBINATORS = ["descendant", "child", "sibling"] as const;
type SelectorCombinator = (typeof SELECTOR_COMBINATORS)[number];

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

export function isShellSelector(selector: string): boolean {
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

export function actualLayerOffsets(raw: string): readonly number[] {
  const text = blankCssComments(raw);
  return [...text.matchAll(/@layer(?=\s|\{)/gu)].map((match) => match.index);
}
