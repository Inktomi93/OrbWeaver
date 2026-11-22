---
kind: work
status: blocked
updated: 2026-11-22
priority: P3
area: db
blocked: owner
plan: unwired-code
---

# Junction tables drop the attach stamps nothing reads

## What

Fifteen junction created_at columns are written at insert and never read: characterPersonas.createdAt, pluginProviderClaims.createdAt, globalRegexScripts.createdAt, characterRegexScripts.createdAt, presetRegexScripts.createdAt, chatRegexScripts.createdAt, chatBooks.createdAt, characterBooks.createdAt, globalBooks.createdAt, personaBooks.createdAt, characterTags.createdAt, chatTags.createdAt, worldBookTags.createdAt, personaTags.createdAt, presetTags.createdAt. Lists over these junctions order by position or name.

## Why

A stamp no reader, route or screen uses is dead schema. The owner signs off first, because the owner ruling defaults collected data to a product item.

## Done when

The owner approves the drop, a numbered migration drops each column, the insert sites stop writing them, and the columns scan no longer lists them.

## Evidence

Filled at landing: what ran and where its output is.
