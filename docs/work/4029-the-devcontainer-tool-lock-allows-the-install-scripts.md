---
kind: tooling
status: open
updated: 2026-11-25
priority: P3
area: tooling
---

# The devcontainer tool lock allows the install scripts it depends on

## What

.devcontainer/tools locks @anthropic-ai/claude-code, @ast-grep/cli and pnpm, whose install scripts the tools need, with no allowScripts entry; the digest-pinned node:26 base runs npm 11 today, which runs them, but npm 12 skips a dependency's install script that allowScripts does not cover.

## Why

A base image move to npm 12 would install the devcontainer tools without their install steps and give no error.

## Done when

The devcontainer tool manifest allows exactly those packages' install scripts by their resolved identity, and a devcontainer build under npm 12 runs them.

## Evidence

Filled at landing: what ran and where its output is.
