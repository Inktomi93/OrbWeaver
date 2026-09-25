---
kind: work
status: open
updated: 2026-09-25
priority: P2
area: chat
---

# Decide whether the static and dynamic system split earns its keep

## What

Investigate whether the static and dynamic split of the system prompt does real work, then delete it or shrink it to the part that does. The split lives in isSectionDynamic (packages/server/src/domain/chat/assembly/assemble.ts:691) and the static and dynamic halves it feeds. Answer each question with evidence:

- Ordering: does the split ever produce a better order than the user's drag order, or does it only move trigger-gated, Memory, Databank and Guided sections out of place?
- Cache: using the live run from item 0158, does the breakpoint after the static half save hits that one breakpoint at the end of the whole system prompt would miss?
- Consumers: do the volatile-macro cache-buster scan, the budget slices, the agent-sdk join, splitSystem and the thinking prefix binding need two halves?

If nothing needs it, delete the split, its trace fields and its tests. Send the system prompt in drag order, and warn in the preset editor when per-turn content sits above Chat History. If a part earns its keep, keep only that part and show it in the preset manager.

## Why

SillyTavern and Marinara send the system prompt in the user's order, with one optional breakpoint on its last block. The owner wants assembly to follow the user's arrangement and to avoid hidden optimization. The split may be a leftover that silently reorders sections, against ADR 0251.

## Done when

The item records the answer to each question with evidence. The split is deleted or reduced, a test shows sections arrive in drag order, and the item 0161 cache settings place their breakpoints on the result.

## Findings

Ordering: the split never beats drag order. It appends every per-turn section after every stable one. On the shipped presets it moves only keyword-fired lore: the default and GM presets deliver it after Dialogue examples, not at its World info anchor. A trigger gate moves its section the same way. The v7 default put Memory, Databank and Guided last in the system block, so the split never moved them. The GM game-state literals classify static, so that preset's static half changes every turn. Proof: the "what the static/dynamic split moves" block in `tests/server/domain/chat/assembly/assemble.test.ts`.

Consumers:

| Consumer | Needs two halves |
| - | - |
| volatile-macro scan (`scanStaticBusters`) | No. It needs the cached run, not a half. |
| budget slices (`pushSlices`) | No. They separate system text from in-chat text only. |
| agent-sdk join (`buildSystemPrompt`) | No. It joins the halves into one string. |
| `splitSystem` (`buildWirePlan`) | Yes. It is the only wire reader: the static row takes the system cache marker. |
| thinking prefix binding (`withBlockBinding`) | No. `drop_block` covers any prefix change. |
| `assembled_dynamic` transform (D50) | Yes. Plugins and automation rewrite the dynamic half only. |
| `promptSnapshot` and the wire viewer | Yes. Stored rows carry both halves. |

Cache: with an empty dynamic half, the static marker is the end-of-system marker. With a non-empty dynamic half that changes, the static marker still hits tools plus the static half, and one end-of-system marker misses the whole system block. Neither layout saves the history marker, because the dynamic half sits before the history. A drag-order layout keeps the same saving if it marks the last block before the first per-turn section. The hit rate is owed to 0158.

Status: not deleted. D251 keeps the split and its cache marker, so a change needs a superseding ADR.

## Evidence

Filled at landing: what ran and where its output is.
