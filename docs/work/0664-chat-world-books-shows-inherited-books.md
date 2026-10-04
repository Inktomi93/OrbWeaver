---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: chat
---

# Chat World books shows inherited books

## What

This chat > World books lists only chat-attached books (chat-books-section.tsx listForChat; server listChatBooks), so a firing character book is invisible. Owner ruling: list global, character and persona books read-only with their source above the attached ones. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

Inherited books show read-only with source labels and attaching still adds to the chat, with a test.

## Evidence

Filled at landing: what ran and where its output is.
