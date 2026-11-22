---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The unwired scans read one typed reference index built once and updated incrementally

## What

Each unwired scan walks and resolves the tree on its own: params, fields and the member scan each take twelve to twenty minutes and peak near the memory bar. A prototype (reports/api-play/index2.ts and incr.ts) builds one typed reference index over every production file in one merged program: every identifier resolved in array-form batches, each site keyed to its declaration handle (index.kind.path) with its role (read, write, read-write, delete, destructured read, object key), object-literal keys mapped through their contextual type to the member they write, no syntax node held past its file. On the real tree it built in about twenty-five seconds, answered a whole-index dead-member query in milliseconds, and after an edit to one contracts file found its dependents in hundredths of a second and re-indexed them in about three seconds through Snapshot.update with ensurePrograms. runWithTemporaryFileUpdate gives a delete trial: remove a member in a throwaway snapshot and read the new diagnostics.

## Why

The scans' run time is the main wait in unwired work; one index built once, persisted by file content hash and updated on change turns a rerun into seconds and gives every scan one home for symbol resolution and site roles.

## Done when

A shared index module under tooling/src/unwired builds the typed reference index fresh on every call (a full build in about a minute, no persistence or incremental update, so freshness needs no proof) and answers many queries in one call: dead members, transitive users and impact, and reachability from the product entry points. It runs on the 7.1 API (array forms, handles not nodes, aliases followed through getAliasedSymbol, module specifiers resolved, one program per 3864). It is taught zod (schema keys and inferred types), tRPC (router procedures to client proxy calls) and Drizzle (table columns to row members) by hand, as the existing scans are. The site-role reader is the one home 3858 asks for. The fields scan reads from it and its report matches the current fields report row by row with every moved row explained, the delete trial confirms delete candidates, and the other scans move to the index after fields.

## Evidence

Filled at landing: what ran and where its output is.
