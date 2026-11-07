// The site and kind vocabulary: one row per hand-rolled thing, with the replacement that owns it and the rule that guards it today.
import type { Layer } from "../eslint/index.ts";

export const SITE_CLASSES = ["bypass", "system-gap", "missing-composite", "token-gap", "one-off"] as const;
export type SiteClass = (typeof SITE_CLASSES)[number];

export interface KindInfo {
  readonly area: "A" | "B";
  readonly what: string;
  /** The token, primitive or composite that owns the thing; null when none exists. */
  readonly replacement: string | null;
  /** The lint rule that already refuses it somewhere; null when nothing does. */
  readonly guard: string | null;
}

const NO_RAW_PAINT = "orb/no-raw-intrinsic-paint";
const RESTRICTED = "better-tailwindcss/no-restricted-classes";
const RAW_INTRINSICS = "orb/no-raw-interactive-intrinsics";

export const KINDS: Readonly<Record<string, KindInfo>> = {
  "tw-arbitrary": { area: "A", what: "Tailwind arbitrary value", replacement: "a token utility (tokens.json)", guard: RESTRICTED },
  "tw-raw-size": { area: "A", what: "raw w/h/size/min/max number", replacement: "w-(--size-*) or w-(--width-*)", guard: null },
  "tw-raw-spacing": {
    area: "A",
    what: "raw padding/margin/gap/inset number",
    replacement: "the spacing step: tight, field, row, block, section, gutter",
    guard: null,
  },
  "tw-radius": { area: "A", what: "literal radius", replacement: "--radius-* token or the primitive shape prop", guard: null },
  "tw-shadow": { area: "A", what: "literal shadow", replacement: "the primitive elevation prop or shadow-from-ingredients", guard: null },
  "tw-border": { area: "A", what: "literal border or ring width", replacement: "--border-width-* token or the primitive edge prop", guard: null },
  "tw-opacity": { area: "A", what: "literal opacity", replacement: "--opacity-* token or a primitive receded prop", guard: null },
  "tw-alpha": { area: "A", what: "opacity modifier on a colour", replacement: "an opaque tone role (tint, edge, text-on-tint)", guard: RESTRICTED },
  "tw-z": { area: "A", what: "literal z-index", replacement: "--z-* token (base, raised, overlay, modal, popover, toast, tooltip)", guard: null },
  "tw-gradient": { area: "A", what: "gradient", replacement: null, guard: null },
  "tw-transform": { area: "A", what: "literal transform", replacement: null, guard: null },
  "tw-clip": { area: "A", what: "clip-path", replacement: null, guard: null },
  "tw-color-literal": { area: "A", what: "palette or literal colour", replacement: "a semantic colour token", guard: RESTRICTED },
  "tw-important": { area: "A", what: "important modifier", replacement: "a variant in @orb/ui", guard: RESTRICTED },
  "tw-viewport-variant": { area: "A", what: "viewport breakpoint variant", replacement: "a container query variant (@cq-*)", guard: null },
  "inline-style-static": {
    area: "A",
    what: "inline style with a literal value",
    replacement: "a token utility, primitive prop or variant",
    guard: "orb/no-static-style-prop",
  },
  "inline-style-runtime": { area: "A", what: "inline style with a runtime value", replacement: null, guard: null },
  "inline-svg": { area: "A", what: "hand-drawn inline svg", replacement: "@orb/ui/icons (grow the allowlist)", guard: "orb/ui-no-inline-svg" },
  "css-raw-color": { area: "A", what: "raw colour in CSS", replacement: "a colour token", guard: "orb/no-raw-color-in-css" },
  "css-raw-length": { area: "A", what: "raw px or rem in CSS", replacement: "a spacing, size, width or radius token", guard: null },
  "css-media": { area: "A", what: "@media on a viewport size", replacement: "a container query or a token condition", guard: "orb/no-raw-media-condition" },
  "css-important": { area: "A", what: "!important", replacement: "a layer or a variant", guard: "declaration-no-important" },
  "css-z-index": { area: "A", what: "literal z-index in CSS", replacement: "--z-* token", guard: "declaration-property-value-allowed-list" },
  "css-clip-path": { area: "A", what: "clip-path in CSS", replacement: null, guard: null },
  "css-transform": { area: "A", what: "literal transform in CSS", replacement: null, guard: "orb/rest-transform-grid" },
  "css-gradient": { area: "A", what: "gradient in CSS", replacement: null, guard: null },
  "css-radius": { area: "A", what: "literal radius in CSS", replacement: "--radius-* token", guard: null },
  "css-shadow": { area: "A", what: "literal shadow in CSS", replacement: "shadow-from-ingredients tokens", guard: "orb/shadow-from-ingredients" },
  "css-opacity": { area: "A", what: "literal opacity in CSS", replacement: "--opacity-* token", guard: null },
  "css-file-outside-layers": { area: "A", what: "stylesheet outside the token and owner layers", replacement: "a primitive skin in @orb/ui", guard: null },
  "raw-button": { area: "B", what: "raw <button>", replacement: "Button, GlyphButton or InlineAction (@orb/ui/button)", guard: RAW_INTRINSICS },
  "raw-input": { area: "B", what: "raw <input>", replacement: "Input, Checkbox, Switch, Slider or NumberField", guard: RAW_INTRINSICS },
  "raw-select": { area: "B", what: "raw <select>", replacement: "Select (@orb/ui/select)", guard: RAW_INTRINSICS },
  "raw-textarea": { area: "B", what: "raw <textarea>", replacement: "Textarea (@orb/ui/textarea)", guard: RAW_INTRINSICS },
  "raw-table": { area: "B", what: "raw <table>", replacement: "Table (@orb/ui/table)", guard: NO_RAW_PAINT },
  "raw-list": { area: "B", what: "raw <ul> or <ol>", replacement: "Stack with ListRow, or InlineList", guard: null },
  "raw-anchor": { area: "B", what: "raw <a>", replacement: "Button or InlineAction with render={<a>}", guard: RAW_INTRINSICS },
  "raw-dialog": { area: "B", what: "raw <dialog>", replacement: "Dialog (@orb/ui/dialog) or FormDialog", guard: null },
  "raw-label": { area: "B", what: "raw <label>", replacement: "Field (@orb/ui/field)", guard: null },
  "raw-hr": { area: "B", what: "raw <hr>", replacement: "Separator (@orb/ui/separator)", guard: null },
  "raw-heading": { area: "B", what: "raw <h1>..<h6>", replacement: "Heading (@orb/ui/text)", guard: null },
  "div-onclick": { area: "B", what: "non-interactive element with onClick", replacement: "Button, or ListRow for a row", guard: RAW_INTRINSICS },
  "div-role": { area: "B", what: "non-interactive element with role=", replacement: "the primitive that owns that role", guard: null },
  "textarea-single-row": {
    area: "B",
    what: "Textarea rows={1} doing an Input's job",
    replacement: "Input (@orb/ui/input)",
    guard: "orb/no-single-row-textarea",
  },
};

export interface Site {
  readonly kind: string;
  readonly path: string;
  readonly line: number;
  readonly section: string;
  readonly layer: Layer;
  /** The token, value or property the site wrote. */
  readonly detail: string;
  /** The tag the site sits on, when it sits on an element. */
  readonly tag: string | null;
  /** `raw` for a lowercase element; a ui element's door otherwise. */
  readonly on: "raw" | "ui" | "composite" | "local" | "none";
  readonly door: string | null;
  /** The full class string the token came from, for the cluster rule. */
  readonly cluster: string | null;
  /** A CSS site in the token or owner layers, where raw values are legal. */
  readonly ownerLayer: boolean;
}

export interface Classified extends Site {
  readonly cls: SiteClass;
  readonly why: string;
  /** What the class asks for: the replacement, the variant to add, the composite name or the token value. */
  readonly fix: string | null;
  /** The group key the class reports under (primitive+override, cluster, literal). */
  readonly group: string | null;
}
