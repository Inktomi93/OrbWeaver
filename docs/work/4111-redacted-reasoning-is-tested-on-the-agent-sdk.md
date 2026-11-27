---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: chat
plan: test-foundation
---

# Redacted reasoning is tested on the agent SDK path and through a fork

## What

The redacted-reasoning mark is tested on the v4 Anthropic wire only: the agent SDK path has no test because no testkit door exposes the SDK spawn, and the fork of a deception game that copies the mark has no test because no deception game fixture exists.

## Why

The mark tells a person the provider hid the reasoning; an untested path can drop it silently.

## Done when

An int test drives the agent SDK path through a scripted SDK child and asserts the mark, and a fork case over a deception game fixture asserts the copy keeps it.

## Evidence

Filled at landing: what ran and where its output is.
