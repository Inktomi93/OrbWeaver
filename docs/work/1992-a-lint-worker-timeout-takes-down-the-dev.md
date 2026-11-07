---
kind: bug
status: open
updated: 2026-11-07
priority: P2
area: testing
plan: test-foundation
---

# A lint worker timeout takes down the dev server and every e2e stack

## What

vite-plugin-checker runs ESLint in the dev server. Under box load the better-tailwindcss sync worker throws an Atomics.wait timeout, nothing catches it, vite exits and the dev supervisor stops the server. An e2e stack serves a built client, so it needs no lint checker at all.

## Why

A lint worker timeout turned a green spec into dozens of connection refused failures, and the cause was invisible in the run log.

## Done when

An e2e stack runs no lint checker, a lint worker failure in development reports without stopping vite, and the supervisor's exit line shows vite's reason.

## Evidence

Filled at landing: what ran and where its output is.
