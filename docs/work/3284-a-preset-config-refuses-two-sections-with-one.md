---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: contracts
plan: import-robustness
---

# A preset config refuses two sections with one key

## What

`PromptSectionId` is documented as unique per preset (`packages/contracts/src/preset/index.ts`), but the prompt config schema does not refuse a repeated key. A SillyTavern file whose `prompt_order` lists one identifier twice imports two sections sharing a key, and a stored config with a repeated key parses as intact. Probe: in `freeSectionId`, the slot-key helper `withOrbSlots` calls, make the loop never suffix, then run `tests/contracts/preset/st-preset-import.contract.test.ts`. The file whose custom prompts are named `memory` and `databank` imports through `promptConfigConfig.parseOutcome` as intact, holding two sections keyed `memory` and two keyed `databank`; only the case's own unique-id assertion fails (`expected 5 to be 7`).

## Why

The editor, the assembly readout and the token costs key sections by that id, so two sections with one key are edited and priced as one.

## Done when

The schema refuses a repeated section key with the key named; the SillyTavern import keeps the first of a repeated identifier and names the rest in its left-out fields; a test pins both.

## Evidence

Filled at landing: what ran and where its output is.
