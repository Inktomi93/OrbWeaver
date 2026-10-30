---
kind: decision
status: open
updated: 2026-10-30
priority: P2
area: server
---

# Move I/O out of domain substrate folders or amend the substrate ruling

## What

`docs/law/Core-0-Architecture-and-Structure.md` §4 defines `substrate/` as pure feature-local helpers with zero I/O and `persistence/` as all database access. Substrate files in several domains (chat, automation, plugin, refinery, stats, workloads, imagery, assets, embeddings, databank, credentials, search, share, admin, roster-preset) import `persistence/` queries, `@orb/db` or `#infra` at runtime. Find them with: `rg -l --pcre2 '^import (?!type)[^;]*from "(@orb/db[^"]*|[^"]*persistence/[^"]*|[^"]*/infra/[^"]*|#infra[^"]*)"' packages/server/src/domain/*/substrate`. No dependency-cruiser rule refuses these imports.

## Why

The domain template tells an author where I/O lives. When the law and the code disagree, the next author follows whichever they read first.

## Done when

Owner rules either that substrate stays pure, in which case each I/O helper moves to `persistence/`, a verb or a named subsystem and a dependency-cruiser rule refuses runtime `persistence/`, `@orb/db` and `#infra` imports from `substrate/`; or that substrate may orchestrate I/O, in which case Core-0 §4 and the ledger state that and the slot's meaning.

## Evidence

Filled at landing: what ran and where its output is.
