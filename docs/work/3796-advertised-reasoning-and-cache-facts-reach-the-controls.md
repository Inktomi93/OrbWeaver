---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: inference
plan: unwired-code
---

# Advertised reasoning and cache facts reach the controls that read them

## What

An owner ruling recorded in item 1558 keeps supportsMaxTokens, refreshOnHit and the prefix cache formats to be wired. The OpenRouter advertised source spells every reasoning model as effort mode and folds after curated rows, so a curated budget-mode model such as claude-sonnet-4.5 may lose its thinking budget control on the OpenRouter route. The connection prompt cache screen reads the capability's cacheRetentionRefresh instead of the resolved plan's refreshOnHit.

## Why

A model that takes a thinking budget may show only an effort picker on one route, and the cache screen reads a second copy of a resolved fact.

## Done when

A capability test folds claude-sonnet-4.5 on the OpenRouter route and pins the budget control; when it fails, a fold rule keeps budget mode where supportsMaxTokens is advertised; the cache screen reads the resolved refreshOnHit; the capability and connection suites pass.

## Evidence

Filled at landing: what ran and where its output is.
