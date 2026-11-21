---
kind: tooling
status: doing
updated: 2026-11-21
priority: P3
area: tooling
lane: wt/agent-aacd2e3eaac8557e7
plan: unwired-code
---

# Coverage branches match through the React Compiler rewrite

## What

The 3809 coverage merge projects browser hits onto the Node coverage universe by start location. Functions match almost fully, but most client branches do not, because the React Compiler rewrites component branches in the browser build, so a client .tsx branch reported as never executed may have run.

## Why

A false never-executed branch in client code would send a lane to delete live code.

## Done when

Browser branch hits map to source branches through the build's source map or a compiler-off coverage build, a planted case covers a compiled component branch, and the report states the match rate per suite.

## Evidence

Filled at landing: what ran and where its output is.
