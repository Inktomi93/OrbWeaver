// The Base UI surface vocabulary: what the INSTALLED @base-ui/react package exposes (`Installed*`), what
// the committed manifest claims about it (`Manifest*`/`Disposition`), and what @orb/ui actually imports and
// renders (`BaseUiBinding`/`RenderSite`). The readers live in ../lib/baseui-read.ts + ../lib/baseui-expand.ts.

/** `part` = an anatomy part (its declaration file declares `<Symbol>Props`); `hook` / `type` = the other
 *  things a component module re-exports (`useFilteredItems`, `Field.ValidityData`). Only a `part` owes a
 *  disposition — a hook has no anatomy to expose or seal away. */
export const EXPORT_KINDS = ["part", "hook", "type"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface InstalledPart {
  readonly kind: ExportKind;
  /** The UNDERLYING declaration name behind the export alias (`Drawer.Handle` → `DrawerHandle`). Recorded
   *  because a re-typing keeps the alias and swaps the target: 1.6's `Drawer.Handle` aliased dialog's
   *  `DialogHandle`, 1.7 mints its own — a material public-surface change the changelog filed as a "fix". */
  readonly symbol: string;
  /** The module the part is re-exported FROM, relative to its component dir. Same reason as `symbol`. */
  readonly from: string;
  /** Every prop NAME this part accepts, sorted (own-declared plus everything the expander resolved through
   *  intersections / `Omit` / `Pick` / heritage). Empty for a hook/type export. */
  readonly props: readonly string[];
  /** The subset of `props` whose declared type is (or contains) a FUNCTION signature, mapped to that
   *  signature's PARAMETER COUNT. This is what makes eventDetails-stripping detectable without a type
   *  checker: Base UI's change handlers are `(value, eventDetails) => void`, so a seal that re-declares one
   *  as `(value) => void` is an arity LOSS visible in the AST (crunch item 6 — the two live cases were
   *  `Combobox`/`Autocomplete`, and the same shape was still live in `Textarea` and `ColorField`). */
  readonly handlers: Readonly<Record<string, number>>;
  /** The keys of `<Symbol>State` — Base UI's own STATE surface for the part, and therefore exactly the set
   *  of `data-*` attributes it stamps on the DOM (`open` → `data-open`, `readOnly` → `data-readonly`). This
   *  is what lets `baseui-state-data-attributes` be a structural rule rather than a name hunch: a seal
   *  computing a class from a boolean that is ALREADY on the element as a data-attribute is re-deriving
   *  state the framework hands it. */
  readonly state: readonly string[];
  /** Heritage / intersection arms the expander deliberately stopped at or could not resolve, as written. */
  readonly inherits: readonly string[];
}

export interface InstalledComponent {
  /** The import specifier a seal writes: `@base-ui/react/select`. */
  readonly module: string;
  /** True when the module re-exports a parts NAMESPACE (`export * as Select from "./index.parts.js"`), so
   *  a seal writes `<BaseSelect.Trigger>`; false for a flat single component (`<BaseButton>`). */
  readonly namespaced: boolean;
  readonly parts: Readonly<Record<string, InstalledPart>>;
}

export interface InstalledSurface {
  readonly version: string;
  readonly components: Readonly<Record<string, InstalledComponent>>;
}

/** What the `@orb/ui` seal does with an anatomy part.
 *  - `exposed`      — the seal renders it (`baseui-anatomy-completeness` proves the claim against the JSX);
 *  - `sealed-away`  — deliberately not rendered, `why` states the decision AND what would end it;
 *  - `n-a`          — nothing in `@orb/ui` wraps this component at all;
 *  - `unresolved`   — the birth state a version bump mints. ALWAYS RED; a human adjudicates it away. */
export const DISPOSITIONS = ["exposed", "sealed-away", "n-a", "unresolved"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export interface ManifestPart extends InstalledPart {
  readonly disposition: Disposition;
  /** Why, and what would end it — the `ExemptionRow` discipline expressed in JSON. Mandatory for every
   *  disposition except `exposed` (whose justification is the rendered JSX the gate checks). */
  readonly why: string;
}

export interface ManifestComponent {
  readonly module: string;
  readonly namespaced: boolean;
  readonly parts: Readonly<Record<string, ManifestPart>>;
}

export interface SurfaceManifest {
  readonly version: string;
  readonly components: Readonly<Record<string, ManifestComponent>>;
}

/** One `@base-ui/react/*` named binding in a file. */
export interface BaseUiBinding {
  /** The local identifier in this file (`BaseSelect`). */
  readonly local: string;
  /** The exported name (`Select`) — the manifest's component key for a value import. */
  readonly exported: string;
  /** The module specifier (`@base-ui/react/select`). */
  readonly module: string;
  /** True for a type-only binding (`import type { SelectRootProps }`) — never a render site. */
  readonly typeOnly: boolean;
}

/** Where a Base UI part is rendered. */
export interface RenderSite {
  readonly file: string;
  readonly line: number;
}
