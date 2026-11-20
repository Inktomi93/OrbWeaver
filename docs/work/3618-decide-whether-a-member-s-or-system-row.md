---
kind: decision
status: blocked
updated: 2026-11-20
priority: P2
area: security
blocked: owner
plan: chat-html-and-presets
---

# Decide whether a member's or system row's stylesheet carries into later replies

## What

Today only character rows at the sandboxed step contribute room stylesheets (roomSheetSources), so imported rows that rely on a user-row sheet draw unstyled. Options: (a) never carry, today's behaviour, no new risk; (b) a member's sheet carries only into that member's own view, self-styling with no cross-author effect, which does not fix imports others view; (c) a member's sheet carries for every viewer behind a host room switch as a null author, so external media never loads; cross-author CSS inside frames can restyle or hide a character's text, with no script and no fetch; (d) carry only from rows an import wrote as the user, a narrow fix that adds a provenance bit. The security review recommends (c) with media forced off; the smallest step is (b).

## Why

Imported chats that rely on a user-row stylesheet draw unstyled, but a cross-author carry is a new consent and needs a security ruling.

## Done when

A security-builder rules whether member and system sheets carry, and under which trust step and room switch, with the threat each answer guards; the ruling is recorded in the trust model table and a work item is minted if carry is allowed.

## Evidence

Filled at landing: what ran and where its output is.
