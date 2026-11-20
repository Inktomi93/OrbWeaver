---
kind: decision
status: open
updated: 2026-11-20
priority: P3
area: security
plan: chat-html-and-presets
---

# Decide whether a card's creator-notes stylesheet can style the app, behind a per-character consent

## What

Fourteen of the owner's cards carry stylesheets in creator notes. SillyTavern scopes that CSS to the notes view and applies it app-wide only after a per-character consent prompt. None of the measured sheets targets the chat, and no chat row uses a class one defines. Orbweaver has no app-wide application of creator-notes CSS.

## Why

Cards built for that SillyTavern consent lose their intended look, but applying card CSS outside a frame is a new consent with real reach.

## Done when

A security-builder rules whether to offer the per-character consent and where such CSS may apply; the ruling is recorded and a work item is minted if allowed.

## Evidence

Filled at landing: what ran and where its output is.
