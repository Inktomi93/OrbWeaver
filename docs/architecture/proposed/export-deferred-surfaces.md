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

## ~~The HTTP download registrar — the reachability gap~~ (RESOLVED — PD-109 DONE 2026-07-05)

The registrar section this doc originally carried is BUILT: `entry/http/export.ts` exists and serves
both routes per the carried design (front-door-only, 404-on-null, `Content-Disposition` from the verb's
filename, same auth seam, CSRF-free GET). The code is now the doc (triage cut 2026-07-09).

## Bulk / library zip export — DEFERRED (unflagged; no PD row)

_Criterion to build:_ when a "download my library" surface is wanted — add `exportLibrary` (a zip of N
card PNGs / N chat JSONLs) to export's packaging layer (`substrate/` + a streaming `entry/http` route).
The serde core is unchanged; only the packaging layer grows.

## Carried decisions (one-liners; enforcement already in code)

- `exportChat` gate widening: HOST-only in v1 (D29) → widening to `requireParticipant` is a deferred
  **additive** change (the roster read is already in the verb).
- Agent-speaker names in transcripts degrade to the header character name until `resolveAgentSpeaker`
  lands — tracked at its FLAG[PD-17] site in `verbs/export-chat.ts`, not here.
