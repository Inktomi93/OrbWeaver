---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# The unions slot reader reads type parameters and library parameters

## What

tooling/src/unwired/graph/unions.ts belongsTo treats a slot whose origin it cannot read as belonging to every tuple, so a product literal in such a slot builds a same-named member of every tuple. The reader gives up on a slot typed by a type parameter (pick<const M extends Mode>, RefKnob<E extends EntityKind>), a generic table (Recipes\<Role, Host> through Floor\<R, H>) and a library-declared parameter (bag.push on KindW\[]).

## Why

A wildcard credit can hide an unbuilt member: one literal elsewhere marks it built. Snap literals already credit nothing in an unreadable slot; product literals still do until the reader can name the tuple.

## Done when

The reader reads a type-parameter slot through its constraint or instantiation and a library parameter through the receiver's instantiation; belongsTo returns false for an unreadable slot from any file; the ORIGIN, SCHEMA and INFERRED planted trees and the codes branch case stay green; a real-tree unions diff explains every moved row.

## Evidence

Filled at landing: what ran and where its output is.
