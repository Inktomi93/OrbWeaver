---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: server
lane: wt/agent-ac4fec0a6f2153940
plan: cross-surface-consistency
---

# A large folder dry run does not hold the interactive lane

## What

An import dry run now runs on the one-wide interactive lane. Within the upload limits, a large batch can hold that lane while it collects, delaying other interactive work.

## Why

D209 keeps interactive work from waiting behind long work, and a big preview can become long work.

## Done when

The time a dry run holds the lane is measured at the upload limits, and it is bounded or the risk is recorded with its reason.

## Evidence

Outcome: the hold is recorded, not bounded.

Limits: one upload is at most `IMPORT_TREE_MAX_TOTAL_BYTES` (1 GiB, `packages/contracts/src/uploads/index.ts:79`), `IMPORT_TREE_MAX_FILE_BYTES` per file (64 MiB, :82) and `IMPORT_TREE_MAX_FILES` (50,000, :85). A dry run is one workload per upload; the client sends a folder's uploads one after another (`sendPreviewBatch` in `packages/client/src/features/workloads/hooks/use-library-import.ts`), so a larger folder releases the lane between uploads.

Measured: a throwaway Node integration test posted a dry-run upload through the real tree route and timed `runAdmittedWorkload` against an empty library, with `monitorEventLoopDelay` on the process. Box: 24 cores, shared with other lanes.

| Upload | Dry-run time (lane held) | Event-loop stall, max | Event-loop stall, p99 |
| - | - | - | - |
| 5,001 files (cards) | 5.3 s | 38 ms | 13 ms |
| 50,000 files (cards, the file limit) | 77.7 s | 365 ms | 25 ms |
| 15 chat files of 63 MiB (about 945 MiB, near the byte limit) | 31.1 s | 4.2 s | 2.7 s |

Measured again with the ownership read in place: the library held 300 each of cards, world books, presets and themes (1,200 owned items), and the dry run's upload carried those 1,200 plus unowned non-card items (world books, presets and themes in thirds). Same method, load average 22 to 32 on 24 cores, so read the times as upper bounds.

| Upload | Dry-run time (lane held) | Event-loop stall, max | Event-loop stall, p99 |
| - | - | - | - |
| 17,201 files (16,000 non-card) | 2.8 s | 47 ms | 10 ms |
| 49,201 files (48,000 non-card, the file limit) | 9.9 s | 168 ms | 8 ms |

Each owner read (world books, presets, themes) yields between items. Reading a whole list in one turn stalled the loop: 16,000 themes held it 1.5 s, presets 0.5 s, world books 0.4 s. Non-card items are cheaper to collect than cards, so the file-limit upload of them holds the lane for about 10 s, against 78 s for cards.

Reason it is recorded: a person watches the preview and the dry run moved off the sweep lane because it waited a minute or more behind boot sweeps (D209 (9)). The worst case on the interactive lane is about 80 s, once per upload, and only while a person is previewing a folder at the upload limits. Bounding it would mean splitting one workload's collection into resumable chunks; no lane mechanism does that today and D209 (9) keeps each lane's loop sequential by design. The upload caps are the bound.

Finding to board: collecting 64 MiB chat files stalls the event loop up to 4.2 s (p99 2.7 s). That stall hits the whole server whatever the lane, and the same collection ran on the sweep lane before. The likely cause is the synchronous parse of each large chat file; the cause was not profiled here.
