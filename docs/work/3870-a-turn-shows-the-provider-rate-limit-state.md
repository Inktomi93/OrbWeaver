---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: inference
plan: unwired-code
---

# A turn shows the provider rate limit state

## What

ChatResult.rateLimit carries the provider snapshot (status and reset) from every http backend and only reaches a log line as a spread record; no server or client code reads it.

## Why

Owner ruling: collected data never shown is a product item; a held turn says when the limit resets.

## Done when

A turn that a provider rate limit held or warned names the reset time where the failure or the stamp shows, and a test drives a snapshot through to the screen.

## Evidence

Filled at landing: what ran and where its output is.
