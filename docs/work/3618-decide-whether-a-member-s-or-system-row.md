---
kind: decision
status: open
updated: 2026-11-20
priority: P2
area: security
plan: chat-html-and-presets
---

# Decide whether a member's or system row's stylesheet carries into later replies

## What

Replies now carry stylesheets from earlier character-written rows at the sandboxed step, as SillyTavern applies every displayed message's sheet to every message. Rows whose classes are defined by a member's or system row's sheet stay unstyled: on the owner's real data, five relying rows in SillyTavern imports depend on an imported first row written by the user. Carrying a member's sheet would let one member's CSS style the character's replies on every member's screen, inside the sandboxed frame only.

## Why

Imported chats that rely on a user-row stylesheet draw unstyled, but a cross-author carry is a new consent and needs a security ruling.

## Done when

A security-builder rules whether member and system sheets carry, and under which trust step and room switch, with the threat each answer guards; the ruling is recorded in the trust model table and a work item is minted if carry is allowed.

## Evidence

Filled at landing: what ran and where its output is.
