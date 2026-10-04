---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: chat
---

# A Databank upload asks where it goes, defaulting to every chat

## What

A new document reaches chats only after an unlabeled globe toggle (scope.ts junctions), while the copy promises it feeds chats (databank-copy.ts, databank-section.tsx). Owner ruling: match SillyTavern, whose upload target defaults to Global and whose global attachments reach every chat. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

An upload asks Every chat, This character or This chat, defaulting to Every chat; the copy matches; the toggle turns a document off, with a test.

## Evidence

Filled at landing: what ran and where its output is.
