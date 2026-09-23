---
kind: adr
status: active
updated: 2026-09-23
---

# A saved cast carries its rule presets

## Context

A saved cast restores members, config and anchor into a new room, but the automation rules the host enabled did not travel, so every room needed the same re-enable work.

## Decision

`automation_rules` carries `rule_preset_id` and the resolved `rule_preset_knobs`, paired by a CHECK. The pair is present only on a rule that is exactly what `createRuleFromPreset` minted: that verb stamps it through a verb-only parameter that is not on the tRPC wire, and `updateRule` clears it. Casts store rule presets in the `roster_preset_rules` junction, scoped through `preset_id`. Save derives the room's enabled rule presets on the client from `automation.listRules`, like every other cast field; the write verbs validate through automation's `resolveChatRulePresetKnobs` and store the resolved bag. Apply runs after members and config through automation's own front door: an identical complete group is left in place, a drifted group is deleted and re-minted, a missing one is minted, and minted rules are then enabled by the applying host. A domain refusal is reported as a skipped preset; any other error aborts. Rules outside the cast are never touched.

## Consequences

Rule presets are a code catalogue, so the junction holds a text id with no foreign key, and a removed catalogue id degrades to a skip at apply. A failed mint leaves disabled rules, so nothing half-built runs.

## Alternatives rejected

- A JSON array column on the cast: ids inside JSON are invisible to gates and SQL, with no key dedupe.
- A foreign key to the rule preset: there is no table.
- Server-side capture from a chat id: a second capture path, and a library rename with no chat open would wipe the rules.
- Land applied rules disabled: fails the point of the feature.
