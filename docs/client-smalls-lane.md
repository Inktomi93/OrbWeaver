# CLIENT-SMALLS lane — two client landings (2026-08-07)

Two bounded, scout-confirmed-OPEN items. Durable notes so the homes + premise corrections survive the
lane's transcript.

## Item 1 — `<speaker>` markup leaked into the chat-list preview subtitle

**Premise correction (the brief was wrong about WHERE).** The brief framed this as "a client lib deriving
the last-message snippet". It is not: the client (`packages/client/src/features/chat/lib/chat-summary-row.ts`
→ `chatSummaryRowView`) passes the server-computed `ChatSummary.lastMessagePreview` through VERBATIM. That
field is produced server-side by the kit engine `projectBodyForPreview`
(`packages/kit/src/content/index.ts`), which tokenizes the body and keeps only `text` spans — but
`<speaker>NAME</speaker>` markers are NOT span-tokens, so they survived inside a `text` span and leaked as
raw markup into the one-line scent.

**Fix (one home, reused engine).** `projectBodyForPreview` now flattens the prose through the existing kit
speaker engine `speakerTagsToPlain` (`packages/kit/src/speaker-label/index.ts`) → `<speaker>Aldric</speaker>x`
becomes `Aldric: x`. No re-spelling of the tag grammar (the content-class-wire duplication ban). The flatten
runs BEFORE the markdown flatten + truncation, so the cap is spent on readable prose, never on `<speaker>`
bytes.

**Why kit, not a client strip.** `lastMessagePreview` is also what `filter-chats.ts` searches — a client-only
display strip would leave raw `<speaker>` markup matchable in search. Fixing at the projection fixes both
surfaces at one home. Proven by kit UNIT test (a CT would be vacuous — the client only renders the server
string). Fence pinned: a non-narrator body carries no `<speaker>` tags, so the strip is a byte-for-byte no-op.

## Item 2 — per-actor tracker grant/revoke editor (the owner ruling made usable)

`sheet.trackerGrants` / `sheet.trackerRevokes` (per-actor tracker EXCEPTIONS, tracked-field-unification §5.1)
were stored, gated (`carriesTracker` = `resolve(appliesTo) + grants − revokes`) and optimistically merged
with NO client editor — so the owner's "explicit-list-only NPC-grants" ruling was a dead letter.

**Write path already existed — client-only work.** `rpg.patchSheet` accepts `trackerGrants`/`trackerRevokes`
(whole-list replace; `packages/contracts/src/rpg/inputs.ts`). No server verb needed.

**The editor** (`packages/client/src/features/rpg/components/rpg-tracker-grants.tsx`) lives in the Status
character takeover (`RpgCharacterDetail`), HOST-ONLY and NON-CAST (grants are the host's call — PERMISSION-omit;
a `cast` NPC has no sheet, its applicability rides the def class / explicit list). Per actor-subject tracker
def it renders a tri-state Select — **By class / Granted / Revoked** — that maps 1:1 onto the stored pair
(`default` = neither list, `grant`/`revoke` = the named list). A revoke wins (the resolver's rule); the two
lists are kept disjoint per key. It writes through the same `patchSheet` door the identity planes use.

**Carriage is server truth, never re-derived here.** The row shows a read-only outcome badge (Carries /
Doesn't carry) from the server-resolved `actor.trackers` set — the panel "never re-derives carriage itself"
(views.ts). A grant flips the badge on the post-write refetch, not optimistically (the optimistic
`applySheetPatch` updates the sheet lists but not the resolved `trackers`).
