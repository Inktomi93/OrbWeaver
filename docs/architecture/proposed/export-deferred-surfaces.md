---
kind: spec
status: draft
updated: 2026-07-03
---

# Proposed — `export`: the deferred/unbuilt surfaces

> Gap doc from gutting `domains/export.md` (the domain + the shared serde core are BUILT; code is
> truth). The BUILT surface — `exportCharacter` / `exportChat` (`packages/server/src/domain/export/`),
> the ONE card serde core (`@orb/server/kit/serde/card`: `cardFromJson` IN + `buildCardV3` /
> `exportBookEntry` OUT + `cardContentHash`, PD-33/PD-44), the PNG dual-chunk codec
> (`@orb/kit/png-card-chunk`), and the ST role bimap (`@orb/kit/message-role`, D32) — is documented by
> code headers + tests. This file carries ONLY the genuinely-unbuilt design so it survives the doc's
> deletion.

## The HTTP download registrar (`entry/http/export.ts`) — the reachability gap (BUG; PD row pending central assignment, filed by the 2026-07 export audit)

`createExportService` is composed at the entry root (`entry/compose/services.ts`) but NOTHING consumes
it — there is no `entry/http/export.ts`, no tRPC procedure, no client href. Both verbs are
runtime-unreachable: a composed-but-dead surface (PD-103-style). The design that lands with the wire-up
(carried from `export.md` Movement + invariant 7 + the §7.1 notes):

- A non-tRPC binary/text download registrar in `entry/http/` (beside `blob.ts` / `upload.ts`), calling
  the export FRONT DOOR only (`#domain/export` — the `entry → domain front door` rule; dep-cruiser
  backstop).
- Two routes: the character card (PNG bytes) and the chat transcript (`?format=jsonl|txt`, default
  jsonl). A verb `null` → **404** (not-owned / non-host and missing collapse — no foreign-existence
  leak; the verbs already encode this).
- Streams with `Content-Disposition: attachment` using the verb's returned `filename` (already
  filename-safe — `substrate/download-slug.ts`).
- Auth: resolve the caller via the SAME auth seam the sibling `entry/http` routes use — never a second
  resolution path. Safe **GET downloads carry no CSRF requirement** (a deliberate transport decision,
  carried from neo — preserve it).

## Bulk / library zip export — DEFERRED (unflagged; no PD row)

_Criterion to build:_ when a "download my library" surface is wanted — add `exportLibrary` (a zip of N
card PNGs / N chat JSONLs) to export's packaging layer (`substrate/` + a streaming `entry/http` route).
The serde core is unchanged; only the packaging layer grows.

## Carried decisions (one-liners; enforcement already in code)

- `exportChat` gate widening: HOST-only in v1 (D29) → widening to `requireParticipant` is a deferred
  **additive** change (the roster read is already in the verb).
- Agent-speaker names in transcripts degrade to the header character name until `resolveAgentSpeaker`
  lands — tracked at its FLAG[PD-17] site in `verbs/export-chat.ts`, not here.
