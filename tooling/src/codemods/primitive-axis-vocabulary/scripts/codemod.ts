// Rewrites the literal colour, fill and size axes of the @orb/ui primitives into the D336 vocabulary by an exact
// map. An element whose mapped axis is an expression or a spread value is left for a hand edit, and so
// is a literal the map does not name; tsc refuses what is left, so nothing is silently half-moved.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

/** The resulting attributes, in order; a value in braces is a JSX expression. `null` refuses the element. */
type Rewrite = readonly (readonly [string, string])[] | null;
type Values = ReadonlyMap<string, string>;

interface PrimitiveRule {
  /** The door segment the element's import must name (`@orb/ui/<door>` or `#primitives/<door>`). */
  readonly door: string;
  /** The attributes this rule reads and replaces. */
  readonly axes: readonly string[];
  readonly rewrite: (values: Values) => Rewrite;
  /** True for a colour and fill rule: an element that already spells the D336 colour vocabulary is left alone. A size
   *  or Toggle rule reads only values the old vocabulary spells, so a rerun finds nothing to map. */
  readonly skipsMoved: boolean;
}

const BUTTON_FILLED: Readonly<Record<string, string>> = { primary: "primary", solid: "primary", destructive: "destructive" };
const BUTTON_VARIANT: Readonly<Record<string, string>> = { secondary: "outline", outline: "outline", ghost: "ghost", link: "link", bare: "bare" };
// `BUTTON_DEFAULT_TONE` in packages/ui/src/primitives/button/variants.ts: a tone equal to it is not written.
const BUTTON_DEFAULT_TONE: Readonly<Record<string, string>> = { solid: "primary", outline: "neutral", ghost: "neutral", link: "primary", bare: "neutral" };
const BUTTON_TONES = new Set(["primary", "destructive", "warning"]);
const BUTTON_INKS = new Set(["muted", "foreground"]);

// A filled intent owned its ink, so a `tone` beside it painted nothing and is dropped. A fill-less intent took the tone
// as its ink: a colour stays a tone, a named ink moves to `ink`. `bare` took its picture's ink.
// Only an element that still spells `intent` is old: a bare `tone` on a Button is already the D336 colour.
function rewriteButton(values: Values): Rewrite {
  if (!values.has("intent")) {
    return null;
  }
  const intent = values.get("intent") ?? "primary";
  const tone = values.get("tone");
  const filledTone = BUTTON_FILLED[intent];
  if (filledTone !== undefined) {
    return [...(filledTone === "primary" ? [] : [["tone", filledTone] as const]), ...(intent === "solid" ? [["focal", "{false}"] as const] : [])];
  }
  const variant = BUTTON_VARIANT[intent];
  if (variant === undefined || (tone !== undefined && tone !== "default" && !BUTTON_TONES.has(tone) && !BUTTON_INKS.has(tone))) {
    return null;
  }
  const out: [string, string][] = [["variant", variant]];
  if (variant !== "bare" && tone !== undefined && BUTTON_TONES.has(tone) && tone !== BUTTON_DEFAULT_TONE[variant]) {
    out.push(["tone", tone]);
  }
  if (variant !== "bare" && tone !== undefined && BUTTON_INKS.has(tone)) {
    out.push(["ink", tone]);
  }
  return out;
}

const BADGE_TONE: Readonly<Record<string, string>> = {
  neutral: "neutral",
  primary: "primary",
  success: "success",
  warning: "warning",
  danger: "destructive",
  info: "info",
};
const BADGE_VARIANT: Readonly<Record<string, string>> = { solid: "solid", soft: "soft", ghost: "outline" };

// The neutral solid pill painted the muted fill, which is the neutral tone's tint: it keeps its look as `soft`, the
// Badge default.
function rewriteBadge(values: Values): Rewrite {
  // A bare `tone` naming a D336 tone is already the new spelling; only `intent` or an old fill-style value is old.
  if (!(values.has("intent") || Object.hasOwn(BADGE_VARIANT, values.get("tone") ?? ""))) {
    return null;
  }
  const tone = BADGE_TONE[values.get("intent") ?? "neutral"];
  const style = BADGE_VARIANT[values.get("tone") ?? "solid"];
  if (tone === undefined || style === undefined) {
    return null;
  }
  const variant = tone === "neutral" && style === "solid" ? "soft" : style;
  return [...(tone === "neutral" ? [] : [["tone", tone] as const]), ...(variant === "soft" ? [] : [["variant", variant] as const])];
}

// Card `tone` value → [tone, variant]; an empty string keeps the default.
const CARD_TONE: Readonly<Record<string, readonly [string, string]>> = {
  neutral: ["", ""],
  clear: ["", "outline"],
  muted: ["", "soft"],
  mutedWash: ["", "soft"],
  raised: ["", "soft"],
  input: ["", "outline"],
  warning: ["warning", "soft"],
  info: ["info", "soft"],
  successTint: ["success", "soft"],
  warningTint: ["warning", "soft"],
  destructiveTint: ["destructive", "soft"],
  infoTint: ["info", "soft"],
  primaryEdge: ["primary", ""],
  primaryOutline: ["primary", "outline"],
  highlight: ["warning", "outline"],
};
// The step-four surfaces keep their `tone` value until their named components land.
const CARD_SURFACES = new Set(["background", "accent", "sidebar", "sidebarEdge", "translucent", "backdrop", "bubble", "userBubble", "systemBubble", "popover"]);

// The colour and fill: [tone attributes, variant], or null for a value the table does not map.
function cardPaint(toneValue: string | undefined, shape: string | undefined): readonly [[string, string][], string] | null {
  if (toneValue !== undefined && CARD_SURFACES.has(toneValue)) {
    return [[["tone", toneValue]], shape === "well" ? "soft" : ""];
  }
  const mapped = toneValue === undefined ? (["", ""] as const) : CARD_TONE[toneValue];
  if (mapped === undefined || (shape === "well" && mapped[1] !== "" && mapped[1] !== "soft")) {
    return null;
  }
  return [mapped[0] === "" ? [] : [["tone", mapped[0]]], shape === "well" ? "soft" : mapped[1]];
}

// `shadow` leaves Card but for the step-four overlay lift; `outline="dashed"` becomes `dashed`.
function cardEdge(shadow: string | undefined, outline: string | undefined): [string, string][] | null {
  if ((shadow !== undefined && !["overlay", "none", "follow"].includes(shadow)) || (outline !== undefined && !["dashed", "solid"].includes(outline))) {
    return null;
  }
  return [
    ...(shadow === "overlay" ? [["shadow", "overlay"] as [string, string]] : []),
    ...(outline === "dashed" ? [["dashed", "{true}"] as [string, string]] : []),
  ];
}

function rewriteCard(values: Values): Rewrite {
  const shape = values.get("shape");
  const paint = cardPaint(values.get("tone"), shape);
  const edge = cardEdge(values.get("shadow"), values.get("outline"));
  if (paint === null || edge === null) {
    return null;
  }
  const [tone, variant] = paint;
  return [
    ...tone,
    ...(shape === undefined || shape === "well" ? [] : [["shape", shape] as [string, string]]),
    ...(variant === "" ? [] : [["variant", variant] as [string, string]]),
    ...edge,
  ];
}

const INK_TONES: Readonly<Record<string, string>> = { destructive: "destructive", success: "success", warning: "warning", info: "info", accent: "primary" };
const NAMED_INKS: Readonly<Record<string, string>> = {
  muted: "muted",
  foreground: "foreground",
  accolade: "accolade",
  speaker: "speaker",
  dialogue: "dialogue",
  narration: "narration",
  prose: "prose",
};

// The Text, Icon, WeaveGlyph and WebSpinner table: a colour stays a tone, a named ink moves to `ink`. On Text the old
// `ink="inherit"` won over any tone, so the tone beside it painted nothing and is dropped.
function rewriteInked(values: Values): Rewrite {
  const tone = values.get("tone");
  const ink = values.get("ink");
  if (ink !== undefined && ink !== "inherit" && ink !== "voice") {
    return null;
  }
  if (ink === "inherit") {
    return [["ink", "inherit"]];
  }
  if (tone === undefined || tone === "default") {
    return [];
  }
  const asTone = INK_TONES[tone];
  if (asTone !== undefined) {
    return [["tone", asTone]];
  }
  // `onPrimary` painted the primary's paired ink wherever it sat, so it names the primary scope it reads.
  if (tone === "onPrimary") {
    return [
      ["tone", "primary"],
      ["ink", "toneForeground"],
    ];
  }
  const asInk = NAMED_INKS[tone];
  return asInk === undefined ? null : [["ink", asInk]];
}

// The step-three size table: a box that is not a scale step leaves `size` for `square` or `wrap` on its scale step, and
// the default step (`md`) is not written.
const BUTTON_SIZE: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  icon: [["square", "{true}"]],
  "icon-sm": [
    ["size", "sm"],
    ["square", "{true}"],
  ],
  wrap: [
    ["size", "sm"],
    ["wrap", "{true}"],
  ],
  "wrap-md": [["wrap", "{true}"]],
};

function rewriteButtonSize(values: Values): Rewrite {
  return BUTTON_SIZE[values.get("size") ?? ""] ?? null;
}

// Toggle `intent` → the D336 style, tone and ink. `neutral` is every default; `command` was the foreground ink on the
// ghost box. `primary` took the primary fill when pressed; the pressed fill is now the one selected fill for every tone.
const TOGGLE_INTENT: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  neutral: [],
  outline: [["variant", "outline"]],
  command: [["ink", "foreground"]],
  primary: [["tone", "primary"]],
};

function rewriteToggle(values: Values): Rewrite {
  return TOGGLE_INTENT[values.get("intent") ?? ""] ?? null;
}

// NumberField `size="inline"` is not a scale step, so it leaves `size` for the Input and Select `layout` twin.
function rewriteNumberField(values: Values): Rewrite {
  return values.get("size") === "inline" ? [["layout", "inline"]] : null;
}

const RULES: ReadonlyMap<string, readonly PrimitiveRule[]> = new Map([
  [
    "Button",
    [
      { door: "button", axes: ["intent", "tone"], rewrite: rewriteButton, skipsMoved: true },
      { door: "button", axes: ["size"], rewrite: rewriteButtonSize, skipsMoved: false },
    ],
  ],
  ["Badge", [{ door: "badge", axes: ["intent", "tone"], rewrite: rewriteBadge, skipsMoved: true }]],
  ["Card", [{ door: "card", axes: ["tone", "shape", "shadow", "outline"], rewrite: rewriteCard, skipsMoved: true }]],
  ["Text", [{ door: "text", axes: ["tone", "ink"], rewrite: rewriteInked, skipsMoved: true }]],
  ["Heading", [{ door: "text", axes: ["tone", "ink"], rewrite: rewriteInked, skipsMoved: true }]],
  ["Icon", [{ door: "icons", axes: ["tone"], rewrite: rewriteInked, skipsMoved: true }]],
  ["WeaveGlyph", [{ door: "web-weave", axes: ["tone"], rewrite: rewriteInked, skipsMoved: true }]],
  ["WebSpinner", [{ door: "spinner", axes: ["tone"], rewrite: rewriteInked, skipsMoved: true }]],
  ["Toggle", [{ door: "toggle", axes: ["intent"], rewrite: rewriteToggle, skipsMoved: false }]],
  ["NumberField", [{ door: "number-field", axes: ["size"], rewrite: rewriteNumberField, skipsMoved: false }]],
]);

const ELEMENT: RuleConfig<TSX> = { rule: { any: [{ kind: "jsx_opening_element" }, { kind: "jsx_self_closing_element" }] } };
const IMPORT: RuleConfig<TSX> = { rule: { kind: "import_statement" } };
const SPECIFIER: RuleConfig<TSX> = { rule: { kind: "import_specifier" } };

export const getSelector: GetSelector<TSX> = () => ELEMENT;

/** The element names this file imports from their primitive door, unaliased. */
function primitiveImports(rootNode: SgNode<TSX>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of rootNode.findAll(IMPORT)) {
    const source = statement.field("source")?.text().slice(1, -1) ?? "";
    for (const specifier of statement.findAll(SPECIFIER)) {
      const name = specifier.field("name")?.text() ?? "";
      const rule = RULES.get(name)?.[0];
      const door = rule === undefined ? undefined : new RegExp(`(?:^@orb/ui/|#primitives/|/primitives/|/art/)${rule.door}(?:/index\\.ts)?$`, "u");
      if (specifier.field("alias") === null && door?.test(source) === true) {
        names.add(name);
      }
    }
  }
  return names;
}

function attributeValue(attribute: SgNode<TSX>): string | undefined {
  const value = attribute.child(2);
  return value?.kind() === "string" ? value.text().slice(1, -1) : undefined;
}

/** One element's edits: the first mapped attribute becomes the new attributes, the others go with their space. */
// An attribute only the D336 vocabulary spells marks an element the rewrite already moved, so a rerun leaves it alone.
// Text's old `ink` axis spelled `inherit` and `voice`, so only another ink is new.
const NEW_ONLY = new Set(["variant", "ink", "focal", "dashed"]);
const OLD_INKS = new Set(["inherit", "voice"]);

function spellsNewVocabulary(attribute: SgNode<TSX>): boolean {
  const name = attribute.child(0)?.text() ?? "";
  return NEW_ONLY.has(name) && !(name === "ink" && OLD_INKS.has(attributeValue(attribute) ?? ""));
}

function rewriteElement(element: SgNode<TSX>, rule: PrimitiveRule): readonly Edit[] {
  const named = element.children().filter((child) => child.kind() === "jsx_attribute");
  if (rule.skipsMoved && named.some(spellsNewVocabulary)) {
    return [];
  }
  const attributes = named.filter((child) => rule.axes.includes(child.child(0)?.text() ?? ""));
  if (attributes.length === 0) {
    return [];
  }
  const values = new Map<string, string>();
  for (const attribute of attributes) {
    const value = attributeValue(attribute);
    if (value === undefined) {
      return [];
    }
    values.set(attribute.child(0)?.text() ?? "", value);
  }
  const next = rule.rewrite(values);
  if (next === null) {
    return [];
  }
  const text = next.map(([name, value]) => `${name}=${value.startsWith("{") ? value : `"${value}"`}`).join(" ");
  const [first, ...rest] = attributes;
  if (first === undefined || text === attributes.map((attribute) => attribute.text()).join(" ")) {
    return [];
  }
  const edits: Edit[] = rest.map((attribute) => ({
    startPos: attribute.prev()?.range().end.index ?? attribute.range().start.index,
    endPos: attribute.range().end.index,
    insertedText: "",
  }));
  if (text === "") {
    edits.push({ startPos: first.prev()?.range().end.index ?? first.range().start.index, endPos: first.range().end.index, insertedText: "" });
  } else {
    edits.push(first.replace(text));
  }
  return edits;
}

const codemod: Codemod<TSX> = (root) => {
  const rootNode = root.root();
  const imported = primitiveImports(rootNode);
  if (imported.size === 0) {
    return Promise.resolve(null);
  }
  const edits = rootNode.findAll(ELEMENT).flatMap((element) => {
    const name = element.child(1)?.text() ?? "";
    const rules = RULES.get(name);
    return rules === undefined || !imported.has(name) ? [] : rules.flatMap((rule) => rewriteElement(element, rule));
  });
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
