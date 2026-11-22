---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# pnpm unwired hits classifies every literal hit of a name

## What

tooling/src/unwired/literal-hits.ts already greps the tracked tree for names and classifies each hit by where it sits (parser for TS and JS, file type for the rest), but only the fields sort reads it, through TypeScript 6. No verb lets an agent ask "where does this name appear and as what", so recon reports a bare grep count or a partial read.

## Why

Agents keep reporting a name as used or unused from an unclassified grep; a hit in a comment, a doc, a test or a string is not a use in code. The evidence rules (AGENTS.md code questions, the code-recon skill) need the classification.

## Done when

A verb pnpm unwired hits \<name...> runs on the graph program and prints each hit with its file, line and class: code read, write, call, type position, declaration, import or export, string literal, template, JSDoc, line or block comment, markdown doc, JSON or YAML config, generated file; split product, test, tooling and docs; totals per class and a scanned-file count; --json for agents. literal-hits.ts is the one home (moved onto the 7.1 parser; field-sort reads the same module). The code-recon skill and AGENTS.md code questions table name the verb. Planted cases per class.

## Evidence

Filled at landing: what ran and where its output is.
