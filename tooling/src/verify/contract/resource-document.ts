// The living-document corpus and the NAMED registries — the two doors of the documents/ledgers family
// (the ResourceHost access-pattern ruling §5).
//
// TWO DOORS BECAUSE THE TWO SUBJECTS FAIL DIFFERENTLY. `documents()` is a CORPUS: its subject is every
// living Markdown document, and one unreadable member is a row inside the fact rather than a reason to
// withhold the other 879. `ledger(id)` is an IDENTITY: its subject is one named registry, and if that
// registry is not there then every judgment built on it — "this D-id has no row", "this PD-id is
// duplicated" — is not merely uncertain, it is INVERTED. That is the refusal split §5 states as law, and it
// is why the two cannot be one door with a filter.
//
// THE REFUSAL SPLIT, LITERALLY: *"an absent named registry/document is unresolved; an empty but valid
// registry is a policy-visible population only when the policy explicitly allows it."* So: an absent ledger
// member REFUSES the fact (the policy never runs and never reports a clean zero over a registry it could
// not read), while a registry that is present, parseable and carries no rows is `ready` with zero rows — a
// population the consuming policy judges. What the status WORD is in the refusal case is the reader's own:
// §2 of the same document is explicit that "missing and parse failure must be separate facts", so an absent
// member is `missing` and an unparseable one is `unresolved`, rather than both being flattened into the one
// word §5 happens to use for the family. Both withhold the verdict; only the reason differs, and collapsing
// them would destroy the distinction the same design asks for two sections earlier.
//
// WHY MARKDOWN PARSING IS HERE AND JUDGMENT IS NOT. Heading/anchor/link extraction is a SYNTAX fact — every
// consumer computes it identically, and each currently re-invents it over a private `readFileSync`. What
// stays in the gates is the grammar of what they then look for: the D-id vocabulary, the PD row shape, the
// reserved-range clause, the exemption tables, the ordered string evaluator.
import type { JsonValue } from "./resource-json.ts";

/** One ATX heading. `anchor` is the GitHub slug a `#fragment` cite resolves against. */
export interface MarkdownHeading {
  readonly depth: number;
  readonly text: string;
  readonly anchor: string;
  /** 1-based. */
  readonly line: number;
}

/** An inline `[text](target)` link or a `[label]: target` reference definition. Autolinks and bare URLs are
 *  NOT links here: no consumer cites through one, and claiming them would inflate every link census. */
export interface MarkdownLink {
  readonly target: string;
  readonly text: string;
  readonly form: "inline" | "reference-definition";
  /** 1-based. */
  readonly line: number;
}

export interface MarkdownDocument {
  readonly path: string;
  readonly text: string;
  readonly headings: readonly MarkdownHeading[];
  readonly links: readonly MarkdownLink[];
}

export type DocumentFacts = MarkdownDocument;

/** A corpus member the reader could not serve. It is a ROW, never a silent drop: a dropped document is
 *  absence, and absence is exactly how a citation policy reports a clean corpus it never read. */
export interface DocumentRefusal {
  readonly path: string;
  readonly status: "missing" | "empty" | "unresolved" | "malformed";
  readonly reason: string;
}

export interface DocumentIndex {
  /** Every readable `.md` member of the living-document tree, sorted by path. */
  readonly documents: readonly DocumentFacts[];
  /** Members the reader refused, sorted by path. `documents.length + refusals.length` is the denominator. */
  readonly refusals: readonly DocumentRefusal[];
}

/** The living-document tree. `documents()` claims the `docs/` corpus and nothing else — a root `AGENTS.md`
 *  or `README.md` is not a living document and is not silently folded in. */
export const DOCUMENT_CORPUS_ROOT = "docs";

/** How a ledger names its members: a closed list of files, or a flat tree whose members are the file names
 *  matching `member` (a file outside that grammar, such as the tree's generated index, is not a member). */
export type LedgerDefinition =
  | { readonly nature: "markdown"; readonly paths: readonly string[] }
  | { readonly nature: "markdown"; readonly tree: string; readonly member: RegExp };

/** A numbered doc file name, `NNNN-<slug>.md`, as `pnpm doc` mints it: the number is an ADR's D id or a
 *  work item's id. A tree's generated `README.md` index is not a member. */
const NUMBERED_DOC_RE = /^(\d{4,})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u;

/** Closed ledger identities. `nature` selects the member grammar, which is what makes the per-id fact type
 *  narrow without putting any consumer's ROW SCHEMA in this contract (the same line `resource-json.ts`
 *  draws: the door's promise is "this parsed", never "this is shaped the way your policy wants"). */
export const LEDGER_DEFINITIONS = {
  /** The D-ledger: one decision per `docs/adr/NNNN-<slug>.md`, its id the file number.
   *  `d-citation-integrity` adjudicates every `D<n>` cite against the file names. */
  "d-ledger": { nature: "markdown", tree: "docs/adr", member: NUMBERED_DOC_RE },
  /** The work items: one per `docs/work/NNNN-<slug>.md`, its id the file number. `warning-workitem-liveness`
   *  holds every warning policy's `workItem` against the item's state. */
  "work-items": { nature: "markdown", tree: "docs/work", member: NUMBERED_DOC_RE },
  /** The PD registry, ACTIVE and CLEARED halves — one identity because a PD id is active XOR cleared, and
   *  reading half of it is how a live id reads as an orphan cite (`gates/pd-citation-integrity.ts:15-19`). */
  "core-audits-debt": {
    nature: "markdown",
    paths: ["docs/law/Core-Audits-and-Debt.md", "docs/law/Core-Debt-Cleared-Ledger.md"],
  },
  /** The enforcement roster `enforcement-registry-parity` reconciles the descriptor corpus against. */
  "gate-enforcement-roster": { nature: "markdown", paths: ["docs/law/Core-Enforcement-Active-Gates.md"] },
} as const satisfies Readonly<Record<string, LedgerDefinition>>;

export type LedgerId = keyof typeof LEDGER_DEFINITIONS;
/** @public knip type-face false positive — the derived NATURE axis of `LEDGER_DEFINITIONS`, the importable spelling beside `LedgerId`; every reader
 *  reaches a ledger's nature through the definition map's own inferred type rather than by naming this alias. */
export type LedgerNature = (typeof LEDGER_DEFINITIONS)[LedgerId]["nature"];

interface LedgerJsonDocument {
  readonly path: string;
  readonly value: JsonValue;
}

export type LedgerFacts =
  | { readonly id: LedgerId; readonly nature: "markdown"; readonly documents: readonly MarkdownDocument[] }
  | { readonly id: LedgerId; readonly nature: "json"; readonly documents: readonly LedgerJsonDocument[] };

/** The per-id narrowing: a `d-ledger` consumer gets Markdown documents from tsc, never a union it
 *  has to re-discriminate at runtime. */
export type LedgerFactsFor<I extends LedgerId> = Extract<LedgerFacts, { readonly nature: (typeof LEDGER_DEFINITIONS)[I]["nature"] }>;
