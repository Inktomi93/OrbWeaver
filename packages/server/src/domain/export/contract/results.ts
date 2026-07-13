// domain/export/contract/results — the verb result shapes. A not-owned/missing entity surfaces as null
// (→ 404) from the verb, not one of these shapes — there is no error class.

export interface ExportedCard {
  readonly bytes: Uint8Array;
  readonly filename: string;
}

export interface ExportedText {
  readonly text: string;
  readonly filename: string;
}
