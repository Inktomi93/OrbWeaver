---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# Tooling asks the program which files are libraries and which package declares a file

## What

ESLint rules and the mutation checker decide a library file, or the package that declares a symbol, by matching /node_modules/ in the file path: eslint/native.ts (the Drizzle package, @types/react, @types sources), eslint/owned-table.ts (the Drizzle query builder and table), eslint/ui-native-contracts.ts (Base UI, @types/react), eslint/port-ownership/foreign-types.ts (zod, ts-reset, isAmbient), eslint/port-ownership/restated-port.ts, mutation-checker/lib/mutant-world.ts. A workspace package resolves through node_modules too, and a pnpm store path or a renamed install changes the text. tooling/src/eslint/closed-vocabulary.ts makes the bare TS6 isSourceFileFromExternalLibrary call, which marks a workspace package linked through node_modules as external; it moves onto the isLibrarySource contract in tooling/src/eslint/brand-names.ts.

## Why

A path regex reads how a path is spelled, not what the file is; the program already knows which files are external and which package each belongs to.

## Done when

Each site asks the program: isSourceFileFromExternalLibrary for a library file, and the resolved package name from the program for a declaring package, through one shared helper per compiler API; no /node_modules/ text test remains in those files; a planted workspace package linked through node_modules and a real dependency are told apart in each rule test.

## Evidence

Filled at landing: what ran and where its output is.
