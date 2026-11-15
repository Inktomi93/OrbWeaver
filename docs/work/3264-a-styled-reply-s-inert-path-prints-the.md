---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: chat
plan: import-robustness
---

# A styled reply's inert path prints the display script's markup and CSS as a code wall

## What

On a Tier A row, and on a Tier B row while its frame is pending, a reply that display scripts styled renders the scripts' raw HTML and the full text of their <style> blocks as monospace text, with the prose far below. renderRunNatively in message-content.tsx renders the run under the untrusted policy, and the Tier A path renders the same styled text, so the template prints instead of being dropped.

## Why

The first thing a user sees after importing a styled preset is what looks like a broken page: a code dump on every room open, and permanently on a plain-text row. The reply is not readable on the fallback path the decision record promises stays readable.

## Done when

A styled reply on the inert path shows its prose with no tag text and no CSS text. A pending Tier B frame shows a sized placeholder or the clean prose. A CT on a Tier A styled row asserts that the row's text holds no <style> content and no tag text, and it fails against the current renderRunNatively.

## Evidence

Filled at landing: what ran and where its output is.
