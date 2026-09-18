---
kind: design
status: draft
updated: 2026-08-14
---

# Demo seeding — the jank, and what "the actual way" costs

> Audit by the #52 lane (agent-a28bdd96, 2026-08-09), stopped-before-build per orchestrator
> instruction when "the actual way" proved to need machinery outside the seeder fence. No files
> touched, no OpenRouter tokens burned. Receipts are repo-relative (identical worktree↔main).
> This doc preserves the audit so it does not die in the transcript
> (\[\[lane-deliverable-text-must-land-in-a-file]]).

## The owner's ask

Twice-corrected: (1) generation must run on **Sonnet 5 via OpenRouter chat-completion**, not the
local vLLM fleet; (2) the rpg-lite d20 demo must be a **real session** (proper setup, turns through
the real pipeline), not seeder-faked; (3) extended to **all six demos** — "our seeders do jank shit
and I'd rather properly make our demo stuff the actual way."

## The jank (concrete, receipted)

The seeder GENERATES NOTHING. It replays committed static bytes + a hand-authored board.

1. **Transcripts are frozen committed files.** `seedOne` reads `deps.readTranscript(slug)`
   (`seed.ts:158`) = `@orb/default-content`'s `demo-chats/<slug>.jsonl`, parses, bulk-writes. Zero
   turn-pipeline calls at seed. "Generated live once, exported, committed" = a human drove them by
   hand previously; the bytes are frozen.
2. **The rpg board is hand-transcribed manifest DATA.** `ASHEN_SPIRE_SETUP`
   (`demo-chats.ts:86-636`) is a hand-written op list; the v3 header (`:67-85`) admits it was read
   off `getTrackerView`/`listJournal` and "translated back into the hand-door op vocabulary." Replayed
   by `createDemoChatGameDoor` (`entry/compose/demo-chat-game.ts`) via hand doors only.

## Planes a real session has that the seed fakes or omits

- **Per-message persona attribution:** FAKED to null — `toMessageInput` sets `personaId: null` on
  every row (`seed.ts:69`). Room anchor persona is real (`:107-134`); message-level is not.
- **rpg per-turn state plane:** ABSENT. `rpg_snapshots` (`db/schema/rpg.ts:128-194`) has TWO arms —
  TURN rows keyed `messageId+variantId` (state evolving turn-by-turn) vs HAND rows (variant NULL).
  The seed produces ONLY hand rows (a single end-state).
- **d20 rolls:** ABSENT. `rpg_turn_tool_calls` (`rpg.ts:304+`) stores each turn's tool calls (the
  rolls) keyed `messageId+variantId`. Seed produces ZERO.
- **Committed lifecycle / per-turn checkpoints:** absent (no real turns to carry them).
- **tokensIn:** LOSSY. ST-JSONL carries one `token_count` routed by role (`serde tokenColumns:510`)
  — assistant rows get tokensOut only; a real orb variant carries BOTH (`serde:855-859`).
- **Injection / author's-note:** the room's `chat_injections` plane is not seeded — only messages +
  group metadata.

## Why the interchange structurally can't carry it

- `parseChatJsonl` `resolvePrimary` (`kit/serde/chat/index.ts:686-707`) SKIPS blank rpg
  state-anchor rows — "unrepresentable at the write boundary and skipped." The state plane rides
  those anchor rows and is dropped at parse.
- `domain/export/verbs/export-chat.ts` imports NO rpg (grep clean); export is chat-JSONL only.
  Exporting a real rpg session loses 100% of rpg state — which is WHY the hand-authored manifest
  replay exists as a workaround.

## What "the actual way" requires

- **All six demos:** a generation harness driving `chat.startChat`/`chat.send` through the real turn
  pipeline against Sonnet-5/OR, then a capture path serializing GENUINE resulting state into the
  seed. Reaches `domain/chat` services + `infra/providers`; NOT in `seeder/**`.
- **The rpg demo additionally:** an rpg-state-aware capture+serialize+replay spanning
  `domain/export` + `kit/serde/chat` + `domain/rpg` (snapshots TURN arm, turn_tool_calls, sheets,
  journal, checkpoints, committed lifecycle) — none representable by chat-JSONL or the seeder's
  bulk-import+hand-replay delivery today.

## Recommended shape (lane's rec, orchestrator-endorsed)

A dev **record-demo harness** (`scripts/`, throwaway tooling): (a) sets up each room properly incl.
rpg-lite with real config, (b) drives real turns via the pipeline against Sonnet-5/OR, (c)
serializes ALL planes to a richer seed-asset bundle — **check whether `kit/serde/chat-bundle` can be
extended to carry rpg state** rather than inventing a new format — (d) a seed path replaying that
bundle faithfully. Multi-domain, multi-lane; likely needs the interchange/export extended to carry
rpg state as first-class.

Delivery is largely free for the owner (his stack re-mints fresh); the hard part is genuine
PRODUCTION + CAPTURE, not delivery.

## THE OWNER FORK (why this is a doc, not a lane)

The load-bearing decision is **whether rpg state becomes first-class in export/interchange**:

- **Broad:** make rpg-state export/import first-class (extend `chat-bundle` + `export-chat` +
  `parseChatJsonl` to carry the TURN snapshots / tool-calls / journal). Demo seeding then rides a
  real capability — and this ALSO pays down the deferred rpg-session portability gap (D6 family): a
  real user could export/import an rpg game, not just chat. Bigger, strategic, forge-tier design.
- **Narrow:** a demo-only capture side-path that snapshots rpg state into a bespoke seed bundle
  without touching the general export contract. Smaller, demo-scoped, leaves real rpg export still
  unable to travel.

Model slug note for the build: repo slugs are obfuscated (`nn-5`/`nopus-4-8`/`nagent-sdk`);
`DEFAULT_CHAT_MODEL_ID = "nopus-4-8"`. The build must resolve the exact OR Sonnet-5 slug + confirm
the seeded owner OpenRouter key is live before generating.
