---
kind: tooling
status: open
updated: 2026-11-11
priority: P2
area: db
plan: checked-law
---

# Checkers for the migration, baseline and transaction rulings, and three live violations fixed

## What

The law census found rulings in .claude/rules/db.md and AGENTS.md with no checker. Nothing compares the drizzle schema with the migrations, and test databases are built from the live schema, so a schema change with no numbered migration passes every test. The baseline migration must never be regenerated, and only the boot-time hash on a real install would notice. db.transaction is banned in the rule and in source comments, but the Db type exposes it and no lint rule refuses a call. Live violations of other rulings: a TODO stands in place of work in the client's new-character slash command mount; a server domain file imports the filesystem module directly; and JSON columns in the db schema are typed as an open record or unknown. Source: the leg-one report under reports/law-census.

## Why

A missing migration reaches the owner's install as a boot failure or silent drift, and the three rulings are cheap to hold with a test or one selector. Each live violation is a ruling already broken with nothing failing.

## Done when

A test fails when the schema and the latest migration snapshot differ, and a test pins the baseline migration's content. A call to db.transaction fails lint or does not typecheck, by the mechanism that fits the Db type's users. The no-TODO ruling is held by lint for TODO and FIXME comments, with the live one resolved as work or a board item. The domain filesystem import moves behind an infra adapter or the census row is corrected with the rule that allows it. Each JSON column gets a schema-derived type or a recorded reason, and a checker for the column typing ruling is added or filed. Each checker has a planted control and reports zero on the tree.

## Evidence

Filled at landing: what ran and where its output is.
