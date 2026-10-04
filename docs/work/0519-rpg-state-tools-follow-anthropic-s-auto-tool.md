---
kind: work
status: open
updated: 2026-10-04
priority: P2
area: rpg
---

# RPG state tools follow Anthropic's auto tool-use guidance

## What

Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1 reject forced tool_choice, so RPG state capture rides auto on the folded turn and on the cheap round after its required-to-auto downgrade. Anthropic offers guidance, not a setting (implement-tool-use: best practices; forcing tool use): detailed descriptions (3-4+ sentences: what, when, when not, each param), input_examples on complex inputs, fewer tools, an explicit 'use the X tool' line in the user message under auto, strict:true. Work: audit the 7 state-tool descriptions (buildToolRoundWireTools and their prose slots); add input_examples to update_scene (21 fields); add the explicit tools line to the cheap round's own user message only (the folded path keeps bookkeeping out of the narrator prompt, gather.ts ~158); cache-mark the state round's static system prompt and tools if not already.

## Why

Auto mostly works (gather.ts ~160: 1-3 strict calls on 6/6 turns; no_changes makes nothing-happened a call), but an occasional skipped turn forces 0511's structured fallback. This lowers how often it fires. Owner-requested in chat. Considered and not boarded: folded Smart naming the next speaker by tool; the whole turn as structured output (worse prose, escaped stream, breaks continue/swipe/impersonate).

## Done when

Descriptions rewritten to the checklist; update_scene carries input_examples; the cheap round carries the instruction line; the state round's static prefix is cache-marked or proven already marked; the RPG probe on Claude 5.5 shows the per-turn tool-call rate with and without the change on the same transcript with N repeats.

## Evidence

Filled at landing: what ran and where its output is.
