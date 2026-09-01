/** One bounded browser-cascade query. Selectors use Snap's existing selector grammar; properties are
 * CSS identifiers or custom-property names, never free-form CSS. */
export interface CssCascadeQuery {
  readonly selector: string;
  readonly property: string;
  readonly page: number;
  readonly matchIndex?: number;
}

type CssDeclarationState = "Active" | "Overloaded";

const CSS_CASCADE_SOURCE_KINDS = [
  "client-global",
  "dynamic",
  "generated-theme",
  "inline",
  "owner-custom-css",
  "shell",
  "ui-global",
  "ui-tier",
  "opaque",
] as const;
export type CssCascadeSourceKind = (typeof CSS_CASCADE_SOURCE_KINDS)[number];

interface CssCascadeRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface CssCascadeDeclaration {
  readonly property: string;
  readonly value: string;
  readonly state: CssDeclarationState;
  readonly important: boolean;
  readonly inherited: boolean;
  readonly styleType: string;
  readonly selector: string | null;
  readonly styleSheetId: string | null;
  readonly sourceUrl: string | null;
  readonly source: CssCascadeSourceKind;
  readonly range: CssCascadeRange | null;
}

interface CssCascadeOkReceipt {
  readonly status: "ok";
  readonly selector: string;
  readonly property: string;
  readonly matchIndex: number;
  readonly computedValue: string;
  readonly targetId: string;
  readonly computedDefault: boolean;
  readonly declarations: readonly CssCascadeDeclaration[];
}

interface CssCascadeInstrumentError {
  readonly status: "instrument-error";
  readonly selector: string;
  readonly property: string;
  readonly error: string;
}

export type CssCascadeReceipt = CssCascadeOkReceipt | CssCascadeInstrumentError;

export interface CssEvidenceReceipt {
  readonly status: "ok" | "instrument-error";
  /** The unchanged #949 `window.__orb.css.read()` payload. */
  readonly merge: unknown;
  readonly cascade: readonly CssCascadeReceipt[];
  readonly repositoryDeclarations: number;
  readonly error: string | null;
}
