// The per-chat DOCUMENTS rack's pure model — the D85 visibility write's set arithmetic, the source-chip
// vocabulary, the detachability test, and the picker's offer set. Zero I/O, zero React: every value is a
// function of what the rack already fetched, so the section stays thin and these rules are unit-tested in
// isolation.
//
// WHY THIS FEATURE OWNS IT: chat, not databank. `features/chat/lib/databank-settings-section.tsx` is the
// landed precedent — "chat owns the {{databank}} slot's consumption, so it lands here" — and per-chat
// document governance is HOST authority over a ROOM, which is chat's authority model, not databank's. A
// tRPC call is a DATA seam, not a feature import (`client-features-no-cross` is satisfied by construction).
//
// THE UNPAGINATED COUPLING, STATED (§2.2's "carry with a guard"): `nextHiddenSet` derives the FULL excluded
// set from the rows the rack rendered, because `chat.setChatDocumentVisibility` has SET semantics — it
// REPLACES `chats.metadata.databankVisibility.hidden` wholesale (a merge patch would strand a re-shown
// document as still-hidden). That is only correct while `databank.listActiveForChat` returns the whole
// union, which it does BY DESIGN and says so in its own header. If that read ever pages, this computation
// silently un-hides every document that fell off the page — the two ends are one decision.

import type { DocumentScopeSource } from "@orb/contracts/databank";
import { DOCUMENT_SCOPE_SOURCES } from "@orb/contracts/databank";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_MARKER_TEMPLATES } from "@orb/contracts/preset";
import type { DocumentId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

/** One row of the chat's ACTIVE union (D85) — the host's payload carries `hidden`; a member's is already
 *  filtered, so their rows are always `hidden: false`. */
type ActiveDocument = inferOutput<Trpc["databank"]["listActiveForChat"]>[number];

/** One row of the CALLER'S OWN bank (`databank.list`) — the picker's candidate pool. The verb is paged, so
 *  the row type comes off the page's `items`, never the page itself. */
type BankDocument = inferOutput<Trpc["databank"]["list"]>["items"][number];

/**
 * The WHOLE excluded-document set after flipping ONE row's visibility — the payload
 * `chat.setChatDocumentVisibility` takes (set-semantics; see the file header).
 *
 * Idempotent in both directions: hiding an already-hidden id, or showing an id that was never hidden,
 * returns the same set. The order is the rendered order with a newly-hidden id appended, so a repeated
 * flip round-trips to a byte-identical payload rather than churning the stored blob.
 */
export function nextHiddenSet(rows: readonly ActiveDocument[], id: DocumentId, hide: boolean): DocumentId[] {
  const current = rows.filter((row) => row.hidden).map((row) => row.id);
  if (!hide) {
    return current.filter((each) => each !== id);
  }
  return current.includes(id) ? current : [...current, id];
}

/** The chip word per scope junction (D-2). A CHIP, never legacy's read-only Switch: a member's global
 *  document cannot be detached by the host, only hidden — a switch would lie about that, a chip states it
 *  (§6.3, the single most important correction over legacy). */
const SOURCE_LABELS: Record<DocumentScopeSource, string> = {
  global: "Everywhere",
  chat: "This chat",
  // Not "via <name>": `ActiveChatDocumentView.sources` carries the junction KIND, not the character it came
  // through (D-2's ruled shape), so naming a character here would be an invention.
  character: "From a character",
};

/** The row's source chips, in the canonical axis order (`DOCUMENT_SCOPE_SOURCES`) rather than whatever
 *  order the resolver happened to credit them — a document can be active through several junctions at once
 *  and a list must not reorder itself row to row. */
export function sourceChips(sources: readonly DocumentScopeSource[]): readonly string[] {
  return DOCUMENT_SCOPE_SOURCES.filter((source) => sources.includes(source)).map((source) => SOURCE_LABELS[source]);
}

/** Can the host DETACH this row here? Only the `chat` junction belongs to this room — a member's global
 *  document or a roster character's stays attached wherever its owner put it, and the host's only lever
 *  over it is the D85 visibility toggle (which is a retrieval switch, never a delete). */
export function isDetachableFromChat(sources: readonly DocumentScopeSource[]): boolean {
  return sources.includes("chat");
}

/** The picker's offer set: the caller's OWN bank minus everything already feeding this room — derived from
 *  the reads the rack already made, never a per-row `listAttachments` (legacy's N+1, §2.2). The subtraction
 *  is over the whole ACTIVE union, so a document already reaching this chat through a roster CHARACTER is
 *  excluded too: offering "add to this chat" for a document that is already in the prompt would be a
 *  control whose only effect is a junction row nobody can see. */
export function attachableDocuments(bank: readonly BankDocument[], activeIds: readonly DocumentId[]): readonly BankDocument[] {
  const active = new Set(activeIds);
  return bank.filter((document) => !active.has(document.id));
}

// ── THE SLOTLESS-PRESET WARNING (issue #80) ──────────────────────────────────────────────────────────
// Attaching a document is only half the promise: the retrieved passages ride the `{{databank}}` macro, and a
// preset whose arrangement never writes that macro drops them silently — the whole rack above says "feeds
// this chat" while the model sees nothing. The shipped default now places the slot, but an ST-imported or
// hand-built arrangement never will, and no server error marks the case (an unreferenced slot is a legal
// no-op by design). So the rack SAYS it, where the documents are.

/** One `{{…}}` occurrence, inner text captured — the engine's own display grammar
 *  (`kit/macro/parser.ts`), so a written `{{databank }}` counts exactly as the engine resolves it.
 *  Case-insensitive, like the registry's own `name.toLowerCase()` lookup. */
const MACRO_OCCURRENCE_RE = /\{\{\s*([^{}]+?)\s*\}\}/gi;
/** A reference's head ends at the first argument/filter separator. */
const MACRO_HEAD_SPLIT_RE = /[:|\s]/u;
const DATABANK_MACRO = "databank";

/** The text a section actually CONTRIBUTES — a literal's content, or a templated marker's custom template
 *  ELSE its factory default. Unlike the preset editor's reference scan (which deliberately reads only what
 *  the author typed), the factory default counts here: a `databank` marker left untouched is precisely the
 *  configuration that DOES feed, and calling it slotless would be the warning crying wolf on the shipped
 *  arrangement. A plain marker carries no template and contributes none. */
function sectionTemplateText(section: PromptSection): string {
  if (section.type === "literal") {
    return section.content;
  }
  const custom = "template" in section ? section.template : undefined;
  if (custom !== undefined && custom !== "") {
    return custom;
  }
  return section.marker in DEFAULT_MARKER_TEMPLATES ? DEFAULT_MARKER_TEMPLATES[section.marker as keyof typeof DEFAULT_MARKER_TEMPLATES] : "";
}

/** Does this arrangement write `{{databank}}` anywhere a turn would render it? DISABLED sections do not
 *  count — a switched-off databank section feeds nothing, which is the same lived outcome as no section at
 *  all, and the chip's job is to state the outcome. */
export function placesDatabankSlot(config: PromptConfig): boolean {
  return config.sections.some((section) => {
    if (!section.enabled) {
      return false;
    }
    for (const match of sectionTemplateText(section).matchAll(MACRO_OCCURRENCE_RE)) {
      const head = match[1]?.split(MACRO_HEAD_SPLIT_RE)[0];
      if (head?.toLowerCase() === DATABANK_MACRO) {
        return true;
      }
    }
    return false;
  });
}
