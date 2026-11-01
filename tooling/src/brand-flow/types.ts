// The records the brand-flow scan collects per world and the report it joins them into. Every record says whether the
// checker settled it (`measured`) or a name or text shape did (`heuristic`).

const PROVENANCES = ["measured", "heuristic"] as const;
export type Provenance = (typeof PROVENANCES)[number];

const MINT_CLASSES = ["parsed", "literal", "rebrand", "raw"] as const;
/** What a value read as where a brand was minted from. */
export type MintClass = (typeof MINT_CLASSES)[number];

const RAW_SHAPES = ["http-param", "db-row", "contract-property", "property", "parameter", "variable", "call", "template", "other"] as const;
/** Where a raw string came from; the shapes a smuggle takes. */
export type RawShape = (typeof RAW_SHAPES)[number];

const MINT_VIAS = ["castId", "as", "typeIdSchema", "brandedId", "id-source"] as const;
export type MintVia = (typeof MINT_VIAS)[number];

const SLOT_KINDS = ["argument", "return", "property", "variable", "jsx-prop", "element", "state", "collection-key", "cast"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

const LAYERS = ["contract", "port", "client-state", "local", "library"] as const;
/** How close a slot sits to a wire or port: the rank of a widen edge. */
export type Layer = (typeof LAYERS)[number];

export interface Where {
  readonly file: string;
  readonly line: number;
  readonly pkg: string;
  /** The node's offset in its file, so two records on one line stay two. */
  readonly position: number;
}

export interface MintSite extends Where {
  readonly via: MintVia;
  readonly brand: string;
  readonly mintClass: MintClass;
  readonly shape: RawShape | null;
  readonly source: string;
  /** The brands a rebrand started from. */
  readonly from: readonly string[];
  readonly provenance: Provenance;
  /** Declaration sites of the names the operand reads, to join a re-narrow with the slot it came through. */
  readonly roots: readonly string[];
  /** The name the operand reads, to compare with the brand the cast names. */
  readonly operandName: string | null;
}

export interface Slot {
  readonly kind: SlotKind;
  /** The slot as a reader would find it: `callee(param)`, `Owner.prop`, `fn() return`, `<Tag prop>`. */
  readonly name: string;
  readonly owner: string | null;
  readonly declSite: string | null;
  readonly declFile: string | null;
  readonly lib: boolean;
}

export interface WidenSite extends Where {
  readonly brands: readonly string[];
  readonly slot: Slot;
  readonly layer: Layer;
  readonly provenance: Provenance;
}

export interface RenarrowSite extends Where {
  readonly how: "castId" | "as" | "compare";
  readonly brand: string;
  readonly source: string;
  /** The slot sites the value was widened into, when the widen edge was found. */
  readonly via: readonly string[];
  readonly proof: "slot-widened" | "type-only";
  readonly provenance: Provenance;
}

export interface MissingSite extends Where {
  readonly name: string;
  readonly brand: string;
  readonly match: "exact" | "suffix" | "alias";
  readonly declKind: string;
  readonly owner: string | null;
  readonly shape: "string" | "collection";
  readonly layer: Layer;
  readonly provenance: Provenance;
}

export interface CrossBrandSite extends Where {
  readonly how: "widen-into-named-slot" | "rebrand" | "named-for-other-brand" | "compare";
  readonly value: string;
  readonly slot: string;
  readonly provenance: Provenance;
}

/** An id-named declaration with no brand to map to: reported apart, never a defect. */
export interface GenericId {
  readonly name: string;
  readonly count: number;
  readonly packages: readonly string[];
}
