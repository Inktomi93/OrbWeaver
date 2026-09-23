// viewgap collectors: `*View`/`*Summary` FIELDS the client never reads (the tier-6 write↔read pairing).
import type { Node, SourceFile } from "ts-morph";
import type { ContractField, FieldReadSites, Hit, ViewFieldCandidate } from "../contract/types.ts";
import { relPath } from "../ops/swallowed.ts";
import { hitOf } from "./emit.ts";
import { contractFieldsOf } from "./fields.ts";

// ── viewgap: a server-projected VIEW field no client file ever reads (audit F4 / tier 6) ─────────────
// `clientgap` asks the same question one tier UP: it splits EXPORT liveness into client-consumed vs
// server-only, so a `*View` the front-end imports at all reads as wired however many of its fields the UI
// never renders. #650 (`netHosts`) was exactly that shape, and the class has no instrument on this tree —
// `contract-field-liveness` cannot see it either, because it asks about PRODUCERS (the server fills these
// fields; that is the point) and never about the READER SIDE. So this lens keeps the field granularity of
// `contract-field-liveness` and flips the side it interrogates: a DECLARED field of a client-facing wire
// shape that no file under `packages/client/src` spells.
//
// THE OWNER FENCE IS THE NAME + TWO HOMES. A `*View`/`*Summary` declared under `packages/contracts/src`
// (the cross-boundary wire home, CLAUDE.md "Type homes and unions") or under `packages/server/src` (a domain's
// `contract/views.ts` — projected to the client through the tRPC proxy, which is an inference no import
// edge can see). Everything else is out of scope by construction: a shape neither home declares is not a
// projection the UI could render.
//
// READS ARE NAME-GLOBAL AND RESTRICTED TO `packages/client/src`, through the SAME reader index
// `contract-field-liveness` uses ({@link fieldIndexes}) rather than a second collector — the two lenses
// disagreeing about what a "read" is would be worse than either being wrong. That index counts all three
// property-read shapes (`x.foo`, `x?.foo`, `x["foo"]`) plus OBJECT destructuring, and it excludes tests
// (a CT asserting a field is not the UI rendering it — the `testonly`/`regkeys` rule).
//
// DECLARED BLIND SPOTS, each stated because a zero here must be priceable:
//   • NAME-GLOBAL, never type-resolved (inherited verbatim from `contract-field-liveness`): any client file
//     spelling the NAME — on a different shape entirely — absolves the field. So this lens UNDER-reports.
//     A hit is STRONG ("no client file spells this name at all"); a clean run is WEAK.
//   • A `{ ...view }` SPREAD into a rendered payload names no key, and neither does a whole-object pass to
//     a generic renderer. Such a field reads as unread here while being fully rendered.
//   • A field consumed only through a computed/template key (`view[`${prefix}Tokens`]`) is invisible, the
//     same TanStack-Form-shaped hole the sibling lens documents.
//   • The reader corpus is `packages/client/src` ONLY — a field rendered exclusively by a `packages/ui`
//     primitive that receives it under another prop name is out of reach.
//
// A DELIBERATE server-only field carries `// @view-server-only: <reason>` on the field (a line comment or a
// JSDoc block — both are leading comment ranges). The reason is REQUIRED, and the marker is TWO-SIDED: a
// marker on a field the client now DOES read is reported STALE and exits 1, so the exemption cannot rot
// into a lie. CANDIDATE lens, never a delete signal — "unwired ≠ worthless" (CLAUDE.md "Build the full shape"): the verdict
// on a hit is WIRE IT, MARK IT, or DELETE IT, and only a human makes it.
const VIEW_SERVER_ONLY_RE = /@view-server-only:\s*\S/u;

/** The client-facing wire-shape NAME heuristic — the same one `clientgap` filters its default scope with. */
const VIEW_OWNER_RE = /(View|Summary)(Schema)?$/u;

/** The two homes a client-facing view may be declared in (see the header's owner fence). */
export const VIEW_OWNER_HOMES: readonly string[] = ["/packages/contracts/src/", "/packages/server/src/"];

/** The READER corpus — the only files whose spelling counts as "the client reads this field". */
export const CLIENT_SRC = "/packages/client/src/";

/** How many client reader files a STALE-marker line names before collapsing to a count. */
const CLIENT_READ_SITES_SHOWN = 3;

/** True if the field carries a leading `@view-server-only: <reason>` — a deliberate keep. The reason is
 *  required (a bare marker does NOT exempt, as with `@column-ok:`/`@swallowed-ok:`). Both spellings land in
 *  the leading comment ranges: a `// …` line comment and a `/** … *\/` JSDoc block (measured — a JSDoc
 *  block IS returned by `getLeadingCommentRanges`, and a line comment sitting BELOW one is returned too). */
export function isViewServerOnly(node: Node): boolean {
  return node.getLeadingCommentRanges().some((range) => VIEW_SERVER_ONLY_RE.test(range.getText()));
}

/** Every field of a `*View`/`*Summary` shape this file declares — the sibling lens's field collector
 *  (interface/type-literal property signatures + `z.object` keys, computed brand names skipped) narrowed to
 *  the client-facing owner names. */
export function viewFieldsOf(sf: SourceFile): ContractField[] {
  return contractFieldsOf(sf).filter((field) => VIEW_OWNER_RE.test(field.owner));
}

/** The `packages/client/src` files that SPELL this field's name as a read. */
function clientReadersOf(field: ContractField, consumed: ReadonlyMap<string, FieldReadSites>): string[] {
  const readers: string[] = [];
  for (const filePath of (consumed.get(field.name) ?? new Map<string, number[]>()).keys()) {
    if (filePath.includes(CLIENT_SRC)) {
      readers.push(filePath);
    }
  }
  return readers;
}

/** Every examined view field paired with its client readers and its marker state — the ONE substrate both
 *  the hit list and the two-sided stale arm read, so they can never disagree about a field's verdict. */
export function collectViewFieldCandidates(fields: readonly ContractField[], consumed: ReadonlyMap<string, FieldReadSites>): ViewFieldCandidate[] {
  return fields.map((field) => ({ field, clientReaders: clientReadersOf(field, consumed), exempt: isViewServerOnly(field.node) }));
}

/** ONE candidate's verdict line — the hit form for a gap, and the evidence form for a stale marker. */
export function viewGapHit(candidate: ViewFieldCandidate): Hit {
  const { field, clientReaders } = candidate;
  const where = clientReaders.slice(0, CLIENT_READ_SITES_SHOWN).map(relPath).join(", ");
  const tail =
    clientReaders.length === 0
      ? "NO file under packages/client/src spells this name (name-matched, never type-resolved — so this is strong evidence, not proof)"
      : `${clientReaders.length} client file(s) SPELL this name (${where}${clientReaders.length > CLIENT_READ_SITES_SHOWN ? ", …" : ""})`;
  const hit = hitOf(field.node, clientReaders.length === 0 ? "view-field-unread" : "stale-view-server-only");
  hit.text = `${field.owner}.${field.name} — ${tail}`;
  return hit;
}
