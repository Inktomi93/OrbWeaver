# Proposed domains — staging area (NOT yet law)

Feature-domain proposals for the SillyTavern gaps Nate greenlit on 2026-06-28 (beyond the D47 set).
Each subfolder is **one proposed home** — source-grounded research (ST + neo), the proposed place in the
orbweaver cake, the contract/db/gate shapes, and the born-compliant-before-Phase-5 bits.

**Status: ADJUDICATED (ledger D48 + D49, 2026-06-28).** Each folder's disposition is now DECIDED — these
docs are the **authoritative expansion** the D-entries point at (the evidence + the homing), but the ledger
is the law on any conflict. Dispositions: `tool-use` → **D48** (IN SCOPE; capability gates landed, wire
shape ships with the domain-owned loop). `image-studio`→imagery, `databank`, `expression-stage`(background
cheap / expressions deferred), `media-surfaces`(gallery v1 free / v2 deferred) → **D49**. When a slice is
built, promote the relevant `proposed/<name>/` to a real `docs/architecture/domains/<name>.md` and clear its
`FLAG[PD-x]` (PD-54..57). Do not build verbatim from a `proposed/` doc — re-read the ledger D-entry first.

## The picks (this round)
| Proposed domain folder | Covers | Source ext (ST) |
|---|---|---|
| `image-studio/` | portrait/prompt-template modes · inpainting/img2img · `/imagine` surface | `extensions/stable-diffusion/` |
| `media-surfaces/` | gallery · server thumbnails/animated-detect · token-counter panel | `extensions/{gallery,token-counter}/` |
| `tool-use/` | tool/function calling (OpenAI path + the `tool` role — born-compliant NOW) · structured/JSON output | `tool-calling.js`, `openai.js` |
| `databank/` | Data Bank / document-RAG (+ doc text-extraction · chunker · scrapers) | `extensions/{attachments,vectors}/` |
| `expression-stage/` | expressions/sprites · background (theming-flavored, NOT the VN scene-compositor) | `extensions/expressions/`, `backgrounds.js` |

## Constitution every proposal must obey
The cake `kit ← contracts ← db ← server ← client` (imports flow DOWN only). Two ownership categories only
(single-owned `ownerId`+`fetchOwned`, or membership-scoped `chatId`+`chat_participants`) — D18/D23.
One-home / derive-don't-respell / no polymorphic tables (per-type FK, D24). Sealed provider backends, no
raw text-completion path. Every invariant ships its enforcer (a gate or a test). The spine wins over neo
patterns and over a loosely-worded prompt.
