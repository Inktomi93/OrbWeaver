// Client form-path resolution over the canonical template registry.
import type { GuidedActionKind, TemplateDef } from "@orb/contracts/preset";
import type { ProseSlotId } from "@orb/contracts/prose";

/** One registry row, resolved for the client: the def plus which slot shape it edits. */
export interface TemplateRow {
  readonly def: TemplateDef;
  /** A guided action carries role/depth beside its prompt; a format string is a bare string. */
  readonly guidedKind: GuidedActionKind | undefined;
  /** The THIRD form path (2026-08-07): a turn-wire framing, stored as `prose[<id>]` — a `{text, baseVersion}`
   *  record rather than a bare string, so its write re-stamps the version the edit was authored against. */
  readonly proseSlotId: ProseSlotId | undefined;
  /** The PROSE-1 default bytes this row ghosts. */
  readonly factoryDefault: string;
}
