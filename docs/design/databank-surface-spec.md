---
kind: spec
status: draft
updated: 2026-08-30
---

# DATABANK CLIENT SURFACE — the documents library, the per-chat rack, and the D85 visibility toggle

**Status:** DESIGN SPEC — DRAFT. Nothing in §3–§10 is built. The SERVER is complete and shipped; the
CLIENT is at zero. This spec designs the client surface and names the (small) server deltas the
designed surface needs, each as an explicit owner decision.

**The re-classification this spec answers (workboard, 08-01):** the AU8 wiring audit filed
`chat.setChatDocumentVisibility` as a "WIRE · M" small. It is not. Verified this session: **the entire
`databank` tRPC router has ZERO client callers** — sixteen procedures, none reached. The one landed
databank client surface (`features/chat/lib/databank-settings-section.tsx`) is the RETRIEVAL KNOBS
(k / minScore / rerank / slot budget), not the documents. Legacy-main's whole `features/databank/`
tree was never ported. This is a build-surface feature, not a wire.

**Evidence — full-file reads, 2026-08-01, this worktree unless noted.** Server:
`packages/server/src/transport/trpc/routers/databank.ts` · `domain/databank/contract/{service,views,results}.ts` ·
`domain/databank/verbs/list-active-for-chat.ts` · `domain/databank/persistence/scope.ts` ·
`domain/chat/substrate/auth/matrix.ts` (the permission rows) · `transport/trpc/routers/chat.ts` (the
`setChatDocumentVisibility` wire schema) · `entry/http/upload.ts` (the multipart route). Contracts:
`packages/contracts/src/databank/index.ts` · `contracts/src/uploads/index.ts` ·
`contracts/src/user-bus/index.ts`. Client: `features/chat/lib/{chats-section,databank-settings-section}.tsx` ·
`features/chat/components/settings-context-tab.tsx` · `features/world-info/{lib/world-info-section.tsx,surfaces/world-info-library-surface.tsx,components/{world-info-context-body,book-attachments}.tsx}` ·
`features/discovery/{lib/corpus-section.tsx,surfaces/corpus-list-surface.tsx}` ·
`components/library-surface.tsx` · `data/invalidation.ts` · `data/auth-config.ts` ·
`state/shell-store.ts` · `lib/registry-contracts.ts` · `main.tsx` ·
`features/workloads/{hooks/use-workload-subscription.ts,components/bundle-workload-tracker.tsx}` ·
`packages/ui/src/primitives/icons/index.ts` (the seal). **Legacy audit (§2)** — every file of
`legacy-main:packages/client/src/features/databank/**` plus `legacy-main:packages/client/src/data/upload-document.ts`,
read via `git show` per file (never checkout/cp). Law read IN FULL: the constitution (`AGENTS.md`), the
executor doctrine, `../history/design/list-pane-projection-proposal.md` §11–§13 (the ratified row/action grammar),
`UI-Density-Law.md` §3 (the tier map + the chrome diet), `home-section-spec.md` (the sibling rail
program), `Core-Docs-Formatting-Law.md`, and the D85 citation set.

**Mocks (the owner rules from pixels):** `docs/design/mocks/databank-surface/library.html` (the
documents library at instrument tier — the LIST pane, both HOME arms side by side, the CONTENT detail,
the activation CONTEXT body) · `docs/design/mocks/databank-surface/attach-rack.html` (the This-chat
Documents section — host view with source chips + visibility toggles, member view beside it). House
style per the `list-pane-projection/` set. **The mocks are drawings, never law** (mocks README) — and
per the owner's steer they follow the ratified grammar + density tiers, NOT legacy's layout.

**Sibling programs this composes with, never fights:** `home-section-spec.md` (adds an eighth rail
section — §3.1's rail-population arithmetic counts it) · `../history/design/list-pane-projection-proposal.md` (§12 is law
here) · `UI-Density-Law.md` (§3.1 tiers) · SET-SEAMS (`docs/history/design/set-seams-spec.md` — owns the settings modal;
the retrieval knobs already live there and this spec does NOT touch them).

---

## 1. What exists — the seam inventory (read, not assumed)

| capability | server | client |
| - | - | - |
| create from text | `databank.createFromText` | none |
| upload bytes | `POST /api/databank/upload` (`entry/http/upload.ts:130-154`) | **none** — `data/upload-asset.ts` exists, `upload-document.ts` does not |
| scrape web / youtube / wiki | `databank.scrapeWeb` · `scrapeYoutube` · `scrapeWiki` | none |
| read one / list many | `databank.get` (`includeText`) · `databank.list` (`origin`/`limit`/`offset`) | none |
| rename / remove | `databank.rename` · `databank.remove` | none |
| reindex | `databank.reindex` (`{kind:'document'}` / `{kind:'owner'}` × `chunk-embed`/`re-extract`) | none |
| global attach | `databank.attachGlobal` · `detachGlobal` | none |
| chat attach (HOST) | `databank.attachToChat` · `detachFromChat` | none |
| character attach | `databank.attachToCharacter` · `detachFromCharacter` | none |
| reverse index | `databank.listAttachments` → `{global, chatIds, characterIds}` | none |
| the chat panel read | `databank.listActiveForChat` → `ActiveChatDocumentView[]` | none |
| D85 visibility write | `chat.setChatDocumentVisibility` (host-gated, set-semantics) | none |
| retrieval knobs | `settings.updateUserSettingsSection("databank")` | **BUILT** — `features/chat/components/databank-settings-section.tsx` |

**What the retrieval-knob section already owns (do not duplicate):** `k`, `minScore`, `rerank`, the
`{{databank}}` slot token budget. This spec's surface is the DOCUMENTS. The only link between them is a
one-line pointer from the library's empty/teaching copy to the knobs' settings anchor.

**What a document IS here** (`contracts/src/databank/index.ts` + `contract/views.ts`): a flat owner-owned
row — `id · name · mime · origin('upload'|'web'|'youtube'|'wiki'|'text') · sourceUrl · byteSize ·
charCount · chunkCount · embeddedCount · createdAt · updatedAt`. `extractedText` is deliberately absent
from the list view (`get({includeText:true})` fetches it). **There is no `status` column** — ingest phase
is DERIVED from the counts. **There is no folder/collection primitive** — documents are flat, and the
D85 comment says per-folder visibility is deferred on a collection primitive that does not exist. This
spec designs no folders.

**Scope semantics** (`persistence/scope.ts`): a chat's ACTIVE set = every PRESENT human member's GLOBAL
documents ∪ the chat's directly-attached documents ∪ the room's PRESENT characters' attached documents,
MINUS the host's hidden set. A member's PRIVATE (unattached) documents can never leak — they have no
junction row to union.

## 2. LEGACY AUDIT — what `legacy-main:features/databank/**` actually did (owner-steered)

Read in full this session, per file. The tree: 4 lib models, 9 components, 2 surfaces, 2 hooks, 1
anchor, 1 front door, 1 selection store, 1 client-data upload seam. **It was a complete, coherent
surface — noticeably better than "scaffolding".** It is also carrying five real defects and one
data-model ambiguity that this spec's design exists to fix.

### 2.1 What it did WELL — carry as INTENT

| capability | receipt | verdict |
| - | - | - |
| **Derived ingest phase, no status column** — `charCount===0 → empty`, `chunkCount===0 → indexing`, `embeddedCount<chunkCount → embedding`, else `ready`; a `Record<IngestPhase, Badge>` dispatch so a new phase fails tsc | `lib/databank-model.ts:41-72` | **CARRY verbatim in logic** (§6 row anatomy). The best thing in the tree: honest derivation from the only truth the server has |
| **The stall hint** — a doc parked in an in-flight phase >5min past `updatedAt` reads as wedged and points at Reindex; `now` INJECTED, read off render via a lazy `useState` initializer | `lib/databank-model.ts:74-95`, `surfaces/databank-detail-surface.tsx:60-63` | **CARRY.** Correct on both counts (determinism seam + no ambient clock) |
| **Three ingestion paths in ONE dialog** with a `Record<AddMode, ReactElement>` dispatch: FileDropzone upload · paste text · scrape URL (web/youtube/wiki, YouTube revealing a caption-language field) | `components/add-document-dialog.tsx` | **CARRY the shape.** The three-mode toggle + conditional lang field is right |
| **Lazy source-text read** — the full `extractedText` is a SEPARATE non-suspense `get({includeText:true})` so revealing it never re-suspends the detail header | `surfaces/databank-detail-surface.tsx:167-186` | **CARRY.** Exactly the reason the contract splits the two reads |
| **Global toggle homed on the DOCUMENT, chat attach homed on the CHAT** — the write lives where the authority lives (owner-scoped vs host-scoped) | `components/document-attachments.tsx:1-6` (the file header states the rule) | **CARRY the rule.** §3 keeps it |
| **The chat tab was member-visible with host-gated writes**, and the `when` was honest (committed chats only — a draft has no room) | `lib/chat-attach-model.ts:26-30`, `lib/databank-chat-context.tsx` | **CARRY the authority model** (§5); REJECT the tab placement (§3.2) |
| **`nextHiddenSet` as a pure, unit-testable set-semantics computation** for the D85 write | `lib/chat-attach-model.ts:32-40` | **CARRY verbatim.** The server takes the FULL excluded list; this is the correct client half |
| **The cross-feature discipline** — the chat + character mounts were CONTRIBUTIONS assembled at the door; databank imported neither feature | `index.ts` header, `lib/databank-{chat-context,character-section}.tsx` | **CARRY** where a contribution is still the right seam (§3.4 yes, §3.2 no — see below) |

### 2.2 What was JANK — REJECT, with the specific defect

| defect | receipt | why it's wrong | verdict |
| - | - | - | - |
| **N+1 attachment queries — one `listAttachments` round-trip PER ROW.** Both the chat rack and the character rack render a row per owned document, and EACH row issues its own `useQuery(listAttachments{id})` | `components/databank-chat-attach-row.tsx:30`, `components/databank-character-attach-row.tsx` (same shape) | A 40-document bank = 40 wire fetches to paint one rack. The reverse index is per-document by construction, so the surface was reaching for the wrong read | **REJECT.** §6.3 designs it out (the rack renders the ALREADY-FETCHED active set; the "add" flow is a picker, not a full mirror) |
| **The same document rendered TWICE in one tab.** "Active in this chat" listed the union; "Attach your documents" listed the whole bank underneath — a globally-attached doc appeared in both, once as an active row and once as a read-only ON switch with an "Everywhere" chip | `components/databank-chat-attach-tab.tsx:43-49` (both sections mounted) | Two lists, one truth. The user cannot tell which row is authoritative, and the second list grows with the bank while the first grows with the room | **REJECT.** §3.2 = ONE list + a picker |
| **A read-only Switch as an information display.** A globally-active doc rendered `<Switch checked readOnly>` — a control that looks operable, is not, and whose real write is in a different section of the app | `components/databank-chat-attach-row.tsx:52-61` | A disabled-looking-enabled control is the classic affordance lie; the "Everywhere" Badge beside it was already carrying the whole message | **REJECT.** §6.3 uses a source CHIP, and the row's only control is the one the viewer may actually operate |
| **`ActiveSection` recomputed the hidden set from the rendered rows**, then wrote the full set back — so the write's correctness depended on the read being complete and un-paginated | `components/databank-chat-attach-tab.tsx:56-58` | Correct today only because `listActiveForChat` is unpaginated. A silent correctness coupling nobody stated | **CARRY WITH A GUARD** — keep the pure `nextHiddenSet`, but §7 pins the read as intentionally unpaginated with a comment, and the CT asserts the written set, not the UI reaction |
| **Hardcoded upload cap** — `MAX_UPLOAD_BYTES = 20_971_520` spelled in the dialog | `components/add-document-dialog.tsx:31` | Verified: `packages/contracts/src/uploads` does NOT exist on `legacy-main`, so this was defensible THEN. It is wrong NOW — the caps catalog is served on `/api/auth/config` and `useUploadCaps()` is the live read (`data/auth-config.ts:74`; consumers at `composer.tsx:183`, `import-library-section.tsx:21`) | **REJECT the literal, CARRY the pre-check.** §4 derives from `useUploadCaps().databankUpload` |
| **A raw `Textarea readOnly` as the source-text viewer**, 12 rows, no search, no chunk boundaries | `surfaces/databank-detail-surface.tsx:186` | It is a text dump in a form control — a form primitive doing an instrument's job, and it teaches nothing about what was actually indexed | **REJECT the primitive.** §3.1 keeps the capability (see the source text) at reduced ambition: a scrollable read-only region, not a form field. Chunk-boundary visualization is explicitly NOT designed here (no server read exposes chunk text) |
| **No ingest progress.** Nothing re-read the counts. A freshly uploaded document sat at `Queued` until the user navigated away and back | no refetch/subscription anywhere in the tree — verified by reading all of `hooks/use-databank-mutations.ts` | The single most visible "is it broken?" moment in the whole feature, unaddressed | **REJECT the omission.** §7 designs the freshness (D-4) |

### 2.3 What legacy simply NEVER DID — greenfield

| gap | note |
| - | - |
| any **retrieval preview** ("what would this chat actually pull for my next message?") | no surface, no proc consumed. `search.documents` exists server-side but is not on the tRPC surface as a client-callable lens. **Out of scope here** — named so it is not mistaken for a port |
| any **per-chat "why is this active?"** disclosure | the union has three sources; the tab never said which. §6.3 fixes it (needs the §11 D-2 server delta) |
| **bulk actions** (multi-select delete/reindex/attach) | none. Not designed here either — no evidence of the need at bank sizes we can observe |
| **owner-wide reindex** surfaced | `reindex({kind:'owner'})` exists on the router; only the per-document arm had a button. §3.1 puts the owner arm in the library header's kebab |
| **origin filter** | `databank.list` takes `origin`; the surface only filtered client-side by name. §6.1 keeps client-side name filter (bank sizes are small) and does NOT add an origin facet — flagged, not built |
| **folders / collections** | the D85 comment defers them on an unminted primitive. Not designed |

### 2.4 Verdict

Legacy's databank surface is a **CARRY-THE-INTENT, REBUILD-THE-BODY**: the domain reasoning (derived
phase, stall hint, authority split, set-semantics write, contribution seams) is good and is cited
throughout §3–§7 as the source. The *lists* are where it fell down — N+1 reads, a duplicated list, a
lying switch, and zero freshness. Nothing in `legacy-main:features/databank/**` should be `cp`'d. Two
files are close enough to port hunk-by-hunk with named edits: `lib/databank-model.ts` (drop nothing,
keep all of it) and `data/upload-document.ts` (swap the response-validation posture check only — it is
already correct).

## 3. The surfaces

### 3.1 THE HEADLINE FORK — where the documents LIBRARY lives

The rail today is EIGHT sections (D121 clause C — `home` leads on the brand cell, AMENDS D62-P6):
home · chats · characters · corpus · worldInfo · presets · refinery · analytics. A Databank section
makes it a **ninth**, and five of the nine (corpus, worldInfo, presets, refinery, databank) are
library-shaped authoring surfaces. That is the samey concern, stated as arithmetic.

**Arm A — its own `databank` rail section** (legacy's shape, `legacy-main:lib/databank-section.tsx`).
LIST = the document library; CONTENT = the document detail; CONTEXT = the `single`-arm activation body.

- Cost: one `SECTION_IDS` tuple member + one registry row in `main.tsx` + one CT list update
  (`tests/client/state/section-registry-provider.ct.tsx:13`). The registry is TOTAL over the tuple by
  tsc, so a half-registration cannot compile. Genuinely cheap.
- Cost: a ninth rail glyph, and a new `Database` icon in the seal.
- Receipt it works: the world-info section is the byte-for-byte same shape and is healthy.

**Arm B — fold into World Info, one KNOWLEDGE section, two families.** Rename the section (label
"Lore" or "Knowledge"); the LIST pane carries a family switch (Books · Documents); CONTENT and CONTEXT
branch on the selection kind.

Receipts that these two ARE the same shape (read this session, not assumed):

| | world-info | databank |
| - | - | - |
| library body | `LibrarySurfaceShell` + `LibraryListLayout` (`components/library-surface.tsx`) | legacy used the identical scaffold (`legacy-main:surfaces/databank-library-surface.tsx:16`) |
| the "everywhere" concept | `worldInfo.listGlobal` + `attach/detachWorldBookGlobal` | `attachGlobal`/`detachGlobal` (**but no `listGlobal` — see §11 D-1**) |
| CONTEXT | `kind:"single"` activation body reading its OWN selection (`world-info-context-body.tsx`) | legacy: byte-identical shape (`legacy-main:components/databank-context-body.tsx`) |
| the job | keyword-triggered lore injected into the prompt | embedding-retrieved passages injected into the prompt |
| chat scope | **deferred at transport** (`book-attachments.tsx:2-3` — "chat scope is deferred") | fully built (host-gated attach + D85 visibility) |

- Cost, stated honestly: the section definition must be owned by ONE feature, and `client-features-no-cross`
  forbids world-info importing databank. So Arm B needs a **family-contribution seam**
  (`makeKnowledgeSection(families)`, the `makeHomeSection(tiles)` / `makeCharactersSection(contributors)`
  precedent) plus a discriminated selection store and branched `content`/`context`. That is roughly one
  extra build stage.
- Benefit: rail stays at eight; ONE answer to "where is the stuff that feeds my prompts from my library".

**Arm C — ride Corpus. REJECTED, with receipts.** Corpus's LIST is a search omnibox over the distilled
catalog, and its own file header states the rule: *"Per A2 the ONE primary here is the search itself;
there is no create action in this section"* (`corpus-list-surface.tsx:7`). Its five CONTEXT tabs are
owner-wide analytics (`corpus-section.tsx`). Documents are an owned CRUD entity with a create-primary,
a rename, a destructive delete, and a maintenance verb. Putting CRUD in the analytics browser breaks
A2 and the section's stated character. Do not re-mine this.

**Arm D — settings-modal only (no rail presence). REJECTED.** A document has a detail surface (metadata,
maintenance, source text) and a selection model; the settings modal is `form` tier with no LIST/CONTENT
split (density §3.1). The retrieval KNOBS belong there and already are; the DOCUMENTS do not.

**RECOMMENDATION: Arm A, with a rail-hygiene rider.** Reasoning, in order:

1. Arm B's coherence is real but its cost lands on a seam that does not exist yet, and the two families
   diverge exactly where it hurts — world-info's chat scope is *deferred at transport*, databank's is
   fully built with a host-authority model and a visibility override. A merged section would present
   two families whose per-chat behavior is not the same, in one pane, on day one.
2. The rail-population problem is real but it is not THIS spec's to solve — `home-section-spec.md` is
   already re-shaping rail semantics (brand-zone affordance, dormant doorways, tiles). Deciding
   library-consolidation inside a databank lane pre-empts that program.
3. The **fork is late-binding**: §8's stages S1–S3 (the row/model layer, the library body, the detail +
   activation bodies) are byte-identical under both arms. Only **S4, the mount**, differs. The owner can
   rule at S4 without blocking the build.

**Rider (cheap, do it either way):** databank contributes a HOME tile when `home-section-spec.md` lands
(recent documents + ingest health), so the library is reachable from Home regardless of arm.

**Tier + density:** the library LIST pane is `instrument` — `p-field` surface inset, `gap-tight` between
rows, `p-row` island pad, `rounded-control`, **no border box on rows** (selection is a bg tint), per
density §3.1 "LIST panes (collection rows)". The document DETAIL in CONTENT is `form` tier (entity
editor row: `p-section` / `gap-section` / `p-block` islands / `rounded-card` group cards only). The
activation CONTEXT body is `instrument` with `form` islands (density §3 explicitly blesses a form island
inside an instrument surface).

### 3.2 The PER-CHAT rack — a "Documents" SECTION in the This-chat tab, not a tab

Legacy grafted a whole "Databank" CONTEXT TAB (`legacy-main:lib/databank-chat-context.tsx`). The tab
strip has since been deliberately consolidated: `settings-context-tab.tsx:1-8` records that the former
"Appearance overrides" tab and the separate "Injections" meta-tab were **merged into ONE "This chat"
tab** because they are the same family — *"what I'm bending for this chat"*. `CHAT_CONTEXT_TAB_IDS` is
now a closed three-member tuple (`registry-contracts.ts:217`).

Per-chat documents are that same family. They belong as a **SECTION inside "This chat"**, placed
directly after Injections (both are "extra content going into this room's prompt") and before Macro
picks. Adding a fourth tab would undo the consolidation the panel-redesign lane just did.

**The seam — and the precedent that makes it free.** The chat-side databank surface does NOT need a
cross-feature contribution at all. The landed precedent is in-tree and explicit:
`features/chat/lib/databank-settings-section.tsx:1-4` — *"Chat owns the `{{databank}}` slot's
consumption (the gather op), so it lands here — never features/settings."* A tRPC call is a DATA seam,
not a feature import; `features/chat` already calls databank-owned procedures. So:

> **The per-chat documents rack HOMES IN `features/chat`** (`components/chat-documents-section.tsx`),
> reading `trpc.databank.*` directly. Zero new registry seam, zero cross-feature import, one owner for
> "what feeds this room".

That also resolves the arm-independence of §3.1 completely: the chat rack ships whether the library is
Arm A or Arm B, and even before the library exists.

### 3.3 The active-documents READ surface (every member)

`listActiveForChat` is member-readable by design (`verbs/list-active-for-chat.ts:1-8`): the active
documents are ROOM-PUBLIC prompt context every member's turns assemble against. The verb branches on
authority — the HOST receives the whole union with per-document `hidden` flags; a MEMBER receives only
the visible subset, and **never learns a host-hidden document's name**.

That branch is the whole design: **one component, two data shapes, no separate member mode.** A member
sees the identical section with the identical rows; the host's rows additionally carry the visibility
control and the hidden-state skin. (`no-separate-reduced-modes` — one surface, permission-class
omission.)

### 3.4 The CHARACTER rack — the seam is already sitting there, empty

`CHARACTER_DETAIL_ANCHORS = ["editor-sections"]` exists (`registry-contracts.ts:271`) and
`characterDetailContributors` is assembled EMPTY-but-typed at the door (`main.tsx:145`). Legacy's
`databankCharacterSection` targeted exactly this anchor. This is the one place the legacy CONTRIBUTION
shape is still right — carry it verbatim in structure, rebuild the body per §6.3 (no N+1).

Character attach is plain ownership on both sides (`contract/service.ts` — "a character is an owned
entity, not a membership room"), so no host/member gating. **Stage S6 — the last stage, droppable.**

## 4. Upload / import path — verified, one client half missing

The server seam is BUILT and needs nothing:

- `POST /api/databank/upload`, multipart `file` + optional `name` (`entry/http/upload.ts:130-154`).
- Belts, in order: auth (401 before a body byte is read) → CSRF on cookie principals (403) →
  `bodyLimit(DATABANK_UPLOAD_MAX_BYTES)` (413) → a per-request check against the admin-tunable
  `maxDatabankBytes` (413; an override may only TIGHTEN).
- `DATABANK_UPLOAD_MAX_BYTES = 20 MiB` (`contracts/src/uploads/index.ts`).
- The response is `UploadResult`: `{document: DocumentView, outcome:'created'|'duplicate',
  ingest:'queued'|'skipped', warning?:'empty-extraction'}`.

The CLIENT half does not exist. **Port `legacy-main:packages/client/src/data/upload-document.ts`
hunk-by-hunk** — it is already correct (raw `fetch`, the `CSRF_HEADER`, and the load-bearing half of
the response validated against the exported `documentViewSchema` rather than bare-cast; the two tiny
server-controlled enums ride as typed pass-through per the `import-tree.ts` precedent). Two named
edits on the way in: nothing in the file itself changes; the CALLER derives its `maxSizeBytes` from
`useUploadCaps().databankUpload`, never a literal (§2.2).

`FileDropzone` (`@orb/ui/file-dropzone`) exists with the `loading`/`success` contract the legacy dialog
used. Accept list: `.txt,.md,.markdown,.pdf,.html,.htm` + their mimes (what `infra/extraction` handles).

**Three non-upload producers ride tRPC unchanged:** `createFromText` (paste), and the three scrapers
(`scrapeWeb`/`scrapeYoutube`/`scrapeWiki`). YouTube's `lang` field is server-defaulted to `"en"`, so the
caption-language control is a reveal, not a required field.

**`outcome:'duplicate'` must be SURFACED, not swallowed.** The server dedups on `(ownerId, importHash)`
and returns the EXISTING document with `ingest:'skipped'`. Legacy silently opened it as if freshly
created. Design: on `duplicate`, the dialog closes, the surface opens the existing document, and a toast
says "Already in your bank — opened it." Same for `warning:'empty-extraction'` (a scanned image-only
PDF): a persistent `Empty` badge on the row (which the derived phase already produces) PLUS a toast at
creation time, because the badge alone reads as a bug.

## 5. Member visibility — who sees and toggles what (the matrix rows, cited)

| action | authority | receipt |
| - | - | - |
| `chat.setChatDocumentVisibility` (hide/show a doc from THIS room's retrieval) | **host** | `domain/chat/substrate/auth/matrix.ts:120` — *"D85 — the host governs which databank documents feed the shared room's retrieval… the setRoomOverrides twin"* |
| `databank.attachToChat` / `detachFromChat` | **host** | `domain/databank/contract/service.ts` — *"Host authority — room-wide prompt content is a one-shot jailbreak surface"*; enforced via the injected `ensureChatHost` |
| `databank.listActiveForChat` | **member** (read) | `verbs/list-active-for-chat.ts:18` — injected `ensureChatMember`; host branch returns hidden rows flagged, member branch is filtered (`:27`) |
| `attachGlobal` / `detachGlobal` | **owner** of the document | `contract/service.ts`; a member's global docs credit any room they are PRESENT in (D85 widening) |
| `attachToCharacter` / `detachFromCharacter` | **owner** of BOTH the document and the character | `contract/service.ts` — plain ownership, no room gating |
| `list` / `get` / `rename` / `remove` / `reindex` / `listAttachments` | **owner** | the router is `authedProcedure`; every verb gates on `principal.userId` |

Three UI consequences that fall straight out and are not negotiable:

1. **A member never sees a host-hidden document at all** — not greyed, not named. The server does not
   send it. The UI must never imply "there are N more you can't see" (that would leak the count).
2. **A member CAN see, and cannot detach, a document another member's global attachment contributed.**
   The honest affordance for a member is: the row, its source chip, and nothing else. The one thing a
   member CAN do about their own contribution is un-global it in their own library — the empty/gloss
   copy says so.
3. **The host's visibility toggle is a RETRIEVAL switch, not a delete** — hiding a doc leaves every
   junction row intact. Copy must not say "remove".

## 6. The row + action grammar (`../history/design/list-pane-projection-proposal.md` §12 conformance)

§12.2 is law for every list pane: ≤3 trailing things, in order — one state toggle (`RowToggleAction`,
pressed = always visible / unpressed = `ROW_REVEAL`, `aria-pressed`) · one primary verb
(`ROW_REVEAL` ghost icon) · the kebab (`RowActionsMenu`, retaining EVERY action including the inline
ones, and the ONLY home for destructive + dialog-opening actions).

### 6.1 The library row (documents)

| slot | content |
| - | - |
| leading | **nothing.** See the phase-chip ruling below — a leading column that is empty on most rows costs ~58px of title at the 320px pane floor for no data |
| title | `document.name` — the full row width |
| subtitle | the phase chip (when it fires) then `Upload · 24.5 KB · 12 chunks` (legacy's `documentSubtitle`, carried) |
| meta | the `updatedAt` relative stamp (the mono title-line stamp `ListRow` already renders) |
| **state toggle** | **Everywhere** — the global attach, as `RowToggleAction` (`Globe` icon, `rest:"when-on"`, label "Feed <name> to every chat" / "Stop feeding <name> to every chat"). **This is the one boolean a user scans a document list for.** Requires §11 D-1 |
| primary verb | **none.** There is no measured-frequent non-navigational verb for a document (contrast presets' Duplicate, which had nine "Default (edited)" rows as its receipt). §12's cap allows a third slot; do not spend it without evidence |
| kebab | Rename (dialog) · Reindex (this document) · **Everywhere** (the N3 mirror-parity item) · Delete (`ConfirmDialog`, destructive) |

**The phase-chip ruling (came out of drawing it, not out of theory).** Legacy rendered a phase `Badge`
in the LEADING slot of every row, `Ready` included. Rendered at the real 320px pane width, a `Ready`
chip on six of seven rows is pure chrome carrying zero information (the steady state IS ready) while
eating the title down to `The Crimson Court — Ho…`. So: **the phase chip renders ONLY for a non-ready
phase** (`Indexing` · `Queued` · `Empty`), inline at the head of the subtitle line. Ready is the ABSENCE
of a chip. That is density §3.2 CD1 / the chrome diet applied literally — subtract chrome until only the
data is left — and it is the one place this spec deviates from legacy's LOGIC rather than its plumbing.
The derived-phase function is unchanged; only the render predicate is new.

Width at the 320px pane floor (§12.3 math), with no leading column: `min-w-24` title floor + toggle 34 +
kebab 34 + gaps ≈ 150px fixed — comfortable slack, two icon affordances + kebab, at the §12.3 cap.

**The list header band** carries: title `DATABANK` (or `DOCUMENTS` under Arm B) + mono count + the ONE
primary `Add` (`Plus`), per A2/N2. The owner-wide `reindex({kind:'owner'})` arm rides a header kebab —
it is a maintenance sweep, never a primary.

**Search** is the landed client-side name filter (`useDeferredValue` + `includes`), unchanged from
legacy. `databank.list` accepts an `origin` facet; NOT built (no evidence of need at observed bank
sizes) — flagged in §11 as a non-decision.

### 6.2 The document DETAIL (CONTENT, `form` tier)

Identity header (name + phase badge + Rename) → **Details** group card (Origin · Type · Size ·
Characters · `N / M embedded` · Added · Updated · Source URL when present) → **Maintenance** (Reindex +
the stall hint when it fires) → **Source text** (reveal → a read-only scroll region, NOT a `Textarea`
— §2.2). All carried from legacy's detail surface with the one primitive swap.

### 6.3 The per-chat rack row (the This-chat "Documents" section)

**ONE list, not two** (§2.2). Rows are the chat's ACTIVE union, host-flagged.

| slot | host | member |
| - | - | - |
| leading | **nothing** (§6.1's phase-chip ruling holds here too) | same |
| title / subtitle | name / the chip row + byte size. **Chunk counts are library detail, not room detail** — the rack answers "what feeds this room", so it drops them | same |
| **source chip** | `Everywhere` (a member's global doc) · `This chat` (chat-attached) · `via Azarael` (one of the room's characters') — a `Badge size="sm" tone="soft"`, first on the subtitle line, preceded by the non-ready phase chip when one fires | same |
| **state toggle** | **the D85 visibility switch** — `RowToggleAction` with `Eye`/`EyeOff`, `aria-pressed`, `rest:"always"` (retrieval state is what the eye scans for). OFF = `hidden`; the row additionally takes the muted/`opacity` skin legacy used | **absent** (permission-OMIT — the control does not render; the server never sent a hidden row anyway) |
| kebab | **Detach from this chat** — ONLY when the source chip is `This chat` (the only junction the host owns here). Absent otherwise | absent |
| section action | **Add from your bank** — opens a picker (see below) | absent |

**Why a source chip and not legacy's read-only switch:** a member's `Everywhere` document cannot be
detached by the host — only hidden. A switch would lie about that; a chip states it. This is the single
most important UX correction over legacy.

**The "Add from your bank" picker** (host only): a dialog listing the caller's OWN `databank.list`
MINUS the ids already in the active set (derived client-side from the already-fetched active list — no
second read, no N+1). Each entry is a one-shot `attachToChat`. This replaces legacy's permanently-mounted
second list.

**Empty states are load-bearing** (`empty-states-are-load-bearing`): "No documents feed this chat yet"
for a host, with the Add action; for a member, "No documents feed this chat yet — anyone can add theirs
from their own library." Never render nothing.

### 6.4 Density + primitives — what is minted

Every element resolves to a landed primitive. New pieces:

| piece | verdict |
| - | - |
| `RowToggleAction` | **already specced** by `../history/design/list-pane-projection-proposal.md` §11 (tier-2 `components/row-toggle-action.tsx`). This spec is its THIRD consumer — if the list-pane lane has not landed it, whichever lane goes first mints it |
| icons `FileText` (document glyph), `Globe` (the Everywhere toggle) | **MINT into the `@orb/ui/icons` seal** — verified absent from `packages/ui/src/primitives/icons/index.ts`. Grow the allowlist; verify the lucide names on the way in |
| icon `Database` | **MINT only under Arm A** (the rail glyph). Arm B reuses `BookOpen`/`Library` |
| everything else | `ListRow` · `Badge` · `Button` · `Switch` · `Section` · `Stack`/`Row` · `EmptyState` · `FileDropzone` · `Input` · `RowActionsMenu` · `ConfirmDialog` · `FormDialog` · `LibrarySurfaceShell`/`LibraryListLayout` — all landed |

Zero new tokens. Zero feature CSS.

## 7. Freshness — a row for every new read

**There is no databank bus event.** Verified: `USER_BUS_EVENT_TYPES` has ten members and none is
databank (`contracts/src/user-bus/index.ts:49-60`), and `grep emitUserEvent domain/databank/` returns
nothing. So every new read's freshness must be named explicitly.

| read | driver | row |
| - | - | - |
| `databank.list` | the producers + CRUD | `createFromText`/`scrapeWeb`/`scrapeYoutube`/`scrapeWiki`/`rename`/`remove`/`reindex` mutations carry `invalidates: [databank.list.pathFilter()]` (legacy's hooks, carried) |
| `databank.list` after an UPLOAD | the multipart seam has no `createEntityMutation` | the upload caller explicitly calls `invalidation.invalidateFilters([trpc.databank.list.pathFilter()])` — the sanctioned seam route, never a bare `invalidateQueries` (`no-inline-invalidate-outside-seam`) |
| `databank.get` | rename / reindex | `invalidates: [..., databank.get.pathFilter()]` |
| `databank.listAttachments` | attach/detach global + character | `invalidates: [databank.listAttachments.pathFilter()]` |
| `databank.listActiveForChat` | attach/detach chat, and the D85 visibility write | `invalidates: [databank.listActiveForChat.pathFilter()]` on all three |
| **`databank.listActiveForChat` on a MEMBERSHIP change** | **NEW ROW — nothing covers this today.** The union is membership-derived: a member joining/leaving, or a character joining/leaving the room, CHANGES which documents feed the room (`persistence/scope.ts:92-104`) | add `trpc.databank.listActiveForChat.pathFilter()` to the `chatUpdated` arm of `BUS_FILTERS` in `data/invalidation.ts`. `chatUpdated` is documented as the membership/handoff event (the code spells that seam `roster`, `chat/verbs/roster.ts` — unchanged by #901), so it is the correct driver. Costs nothing when the panel is closed (`invalidateQueries` is a no-op for a key with no cache entry) |
| **ingest progress** (`chunkCount`/`embeddedCount` → the phase badge) | **NO PUSH EXISTS.** `UploadResult` does not carry the ingest `workloadId`, so the client cannot tail `workloads.subscribe` | **§11 D-3.** Recommended: surface `workloadId` on `UploadResult` and mount the `BundleWorkloadTracker` pattern (`features/workloads/components/bundle-workload-tracker.tsx` — an existing render-nothing subscription that lifts progress + terminal outcome). Fallback with zero server change: a bounded `refetchInterval` on `databank.list` **only while a row is in an in-flight phase**, cleared when none is |
| cross-user union drift | another member toggling THEIR global doc changes MY room's union, and no event crosses users | **ACCEPTED STALENESS, stated.** `listActiveForChat` refetches on tab mount; the panel is not a live instrument. Do not invent a per-user broadcast for it |

`listActiveForChat` is **intentionally unpaginated** — the D85 set-semantics write derives the full
`hidden` set from the rendered rows (§2.2), so pagination would silently corrupt the write. That
coupling gets a comment at both ends (the verb already returns the full set; the client hook states why
it must).

## 8. Build stages — each shippable

| stage | scope | ships |
| - | - | - |
| **S1 — the model layer** | port `legacy-main:lib/databank-model.ts` (derived phase · badge Record · stall hint · subtitle · byte format · origin labels) into `features/<home>/lib/databank-model.ts`; port `data/upload-document.ts`; mint the two icons | pure functions + a wire seam, fully unit-tested, zero UI |
| **S2 — the per-chat rack** (`features/chat`) | `components/chat-documents-section.tsx` + the picker dialog + the visibility mutation hook + the pure `nextHiddenSet`; mounted as a `Section` in `settings-context-tab.tsx` after Injections; the `chatUpdated` freshness row | **the D85 toggle goes live.** Independent of the library arm — this can ship FIRST |
| **S3 — the library body** | the library surface (`LibrarySurfaceShell`/`LibraryListLayout`), the row, the add dialog (3 modes), the rename dialog, the detail surface, the activation body, the selection store | arm-independent: every file compiles and CTs without a section mount |
| **S4 — THE MOUNT (owner fork D-0)** | Arm A: `SECTION_IDS` + `main.tsx` row + the section definition + the anchor. Arm B: the family-contribution seam + the discriminated selection + branched content/context | the library becomes reachable |
| **S5 — freshness + ingest progress** | the D-3 arm (workload tracker or bounded poll) | the "is it stuck?" hole closes |
| **S6 — the character rack** | `CharacterDetailContribution` at `editor-sections`, rebuilt without the N+1 | droppable without breaking anything |

S2 before S3 is deliberate: the visibility toggle is the workboard item, it has zero dependency on the
library, and it exercises the whole read/write pair.

## 9. Test plan

- **Unit (`tests/client/features/<home>/lib/databank-model.test.ts`)** — the derived phase across all
  four arms + the boundary cases (`charCount 0` beats everything; `embeddedCount === chunkCount` is
  ready); the stall hint fires only in an in-flight phase past the threshold with an INJECTED clock;
  `nextHiddenSet` add/remove/idempotent-double-add. Real behavior, not tautologies.
- **Unit** — the picker's "bank minus already-active" derivation, including the case where an active doc
  is active via a CHARACTER (it must still be excluded from "add to this chat").
- **CT — the rack, host** — the visibility toggle fires `setChatDocumentVisibility` with the **full
  expected hidden set** (`assert-the-mutation-fired`: assert the mutation payload, never the UI
  reaction); `aria-pressed` flips; the kebab's Detach renders ONLY for a `This chat` source chip.
- **CT — the rack, member** — no toggle, no kebab, no add action renders; the read-only rows do.
  (Stub the query with a member-shaped payload: no `hidden:true` rows exist in it.)
- **CT — the library row** — the phase badge maps per row; the Everywhere toggle carries `aria-pressed`
  and is mirrored in the kebab; the destructive Delete goes through `ConfirmDialog`.
- **CT — upload** — over-cap file is rejected client-side against `useUploadCaps().databankUpload` (stub
  the config), and `outcome:'duplicate'` surfaces its toast rather than reading as a fresh create.
  `mount()` once per test (`ct-mount-is-once-per-test`).
- **`pnpm snap`** on the mounted library route (S4): `--eval` the row geometry against the resolved
  density tokens, `--contrast` the phase badges, `--aria` the toggle labels. `done ≠ rendered`.
- **Server** — no new server tests unless D-1/D-2/D-3 are ruled IN, in which case each lands with its
  own verb/int test per `Spine-Testing.md`.

## 10. Homes — the file map

| file | change |
| - | - |
| `packages/client/src/data/upload-document.ts` | NEW (S1) — ported hunk-by-hunk from legacy-main |
| `packages/client/src/data/index.ts` | S1 — export `uploadDocument` |
| `packages/ui/src/primitives/icons/index.ts` | S1 — seal grows `FileText`, `Globe` (+ `Database` under Arm A) |
| `packages/client/src/features/chat/components/chat-documents-section.tsx` | NEW (S2) — the rack |
| `packages/client/src/features/chat/components/add-chat-document-dialog.tsx` | NEW (S2) — the picker |
| `packages/client/src/features/chat/hooks/use-chat-document-mutations.ts` | NEW (S2) — attach/detach/visibility |
| `packages/client/src/features/chat/lib/chat-documents-model.ts` | NEW (S2) — `nextHiddenSet` + the picker derivation |
| `packages/client/src/features/chat/components/settings-context-tab.tsx` | S2 — the `Documents` Section after Injections |
| `packages/client/src/data/invalidation.ts` | S2 — `listActiveForChat` joins the `chatUpdated` arm |
| `packages/client/src/features/databank/**` | NEW (S3/S4) — library surface · row · add/rename dialogs · detail surface · activation body · anchor · front door · mutation hooks · model (Arm A). Under Arm B the same files land, the SECTION definition differs |
| `packages/client/src/state/databank-selection-store.ts` | NEW (S3) |
| `packages/client/src/state/shell-store.ts` | S4, Arm A only — `SECTION_IDS` gains `"databank"` |
| `packages/client/src/main.tsx` | S4 — the registry row (+ S6 the character contribution) |
| `tests/client/state/section-registry-provider.ct.tsx` | S4, Arm A — the id list |
| `tests/client/features/{chat,databank}/**` | S1–S6 per §9 (tests live at repo root, mirrored) |

## 11. Owner decisions

| # | decision | recommendation |
| - | - | - |
| **D-0** | **The library's HOME: Arm A (own rail section, 9th) vs Arm B (fold into a merged Knowledge/Lore section, rail stays 8)** | **Arm A**, with the Home-tile rider. Arm B is the more coherent end state but needs a family-contribution seam that does not exist, and the two families' per-chat behavior genuinely differs today (world-info chat scope is deferred at transport; databank's is fully built with host authority + D85). **The fork is late-binding — S1–S3 are identical under both, so this can be ruled at S4** |
| **D-1** | The library row's **Everywhere** inline toggle needs to know which documents are global. There is **no `databank.listGlobal`** (world-info has one). Options: (a) `listAttachments` per row — legacy's N+1, REJECT; (b) mint `databank.listGlobal` mirroring `worldInfo.listGlobal` — one small verb + router row + test; (c) drop the inline toggle, keep global only in the CONTEXT activation body — zero server change | **(b).** It is a five-line verb with an exact in-tree twin, and it buys the single most useful at-a-glance signal in the list. (c) is the honest no-server-change fallback and costs only the inline affordance |
| **D-2** | The rack's **source chip** ("Everywhere" / "This chat" / "via Azarael") needs `ActiveChatDocumentView` to carry its source. `resolveChatDocumentUnion` ALREADY runs the three junction queries separately (`persistence/scope.ts:94-102`) — the information exists and is thrown away. Add `sources: readonly ('global'\|'chat'\|'character')[]` (a doc can be several) | **YES, add it.** Without it the rack cannot say why a document is active, and the host cannot tell a detachable row from an un-detachable one — which is exactly the confusion that made legacy render a lying switch |
| **D-3** | **Ingest progress.** (a) surface `workloadId` on `UploadResult` + tail `workloads.subscribe` (the landed `BundleWorkloadTracker` pattern) — push, small server delta; (b) bounded `refetchInterval` on `databank.list` while any row is in-flight — zero server change, poll; (c) mint a `databankChanged` user-bus event — 3+ coupled sites, and the event would fire per-chunk-batch | **(a)**, with (b) as the ship-now fallback if S5 slips. **(c) is over-built** for a per-document lifecycle |
| **D-4** | Where does the rack sit inside "This chat"? After Injections (recommended) vs at the bottom with the host-only band | **After Injections.** It is the same family ("extra content entering this room's prompt"), and unlike Background/Group/Tool-use it is member-READABLE, so it belongs above the host-only band |
| **D-5** | Should the library get an **origin facet** (the `list({origin})` the server already takes)? | **No, not now.** Client-side name filter only, matching world-info/presets. Revisit if a real bank gets big enough to need it — no evidence today |
| **D-6** | Owner-wide `reindex({kind:'owner'})` + the `re-extract` mode: surface both? | **Yes, both, in the library HEADER kebab** — never a primary, and `re-extract` behind a confirm (it re-runs extraction over every CAS blob) |
| **D-7** | Does the databank library also contribute a **HOME tile** when `home-section-spec.md` lands? | **Yes** — recent documents + an ingest-health line. Cheap, and it de-risks D-0 either way |
