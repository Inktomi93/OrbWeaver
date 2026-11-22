---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: db
plan: unwired-code
---

# Junction tables drop the attach stamps nothing reads

## What

Fifteen junction created_at columns are written at insert and never read: characterPersonas.createdAt, pluginProviderClaims.createdAt, globalRegexScripts.createdAt, characterRegexScripts.createdAt, presetRegexScripts.createdAt, chatRegexScripts.createdAt, chatBooks.createdAt, characterBooks.createdAt, globalBooks.createdAt, personaBooks.createdAt, characterTags.createdAt, chatTags.createdAt, worldBookTags.createdAt, personaTags.createdAt, presetTags.createdAt. Lists over these junctions order by position or name.

## Why

A stamp no reader, route or screen uses is dead schema. The owner approved the drop: an attach time on a tag, book, regex or persona link is not data anyone looks for, and the linked entities keep their own stamps.

## Done when

A numbered migration drops each column, the insert sites stop writing them, and the columns scan no longer lists them.

## Evidence

Filled at landing: what ran and where its output is.
