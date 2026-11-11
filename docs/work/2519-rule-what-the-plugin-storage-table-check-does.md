---
kind: decision
status: open
updated: 2026-11-11
priority: P3
area: db
---

# Rule what the plugin storage table check does about rows it already admitted

## What

The plugin_kv table's CHECK measures a key with a length function that stops at a NUL (packages/db/src/schema/plugin.ts). The host now checks key and value size before every write, so the CHECK is a second line. A NUL-safe CHECK would refuse rows the current one admitted, and a migration that adds it could fail at boot on an install that holds such a row. Only the owner has ever installed the app.

## Why

A second line that measures differently from the first reads as a guarantee it does not give. Changing it is a numbered migration and needs a rule for existing rows.

## Done when

Owner ruling: the CHECK stays as stated and the host check is the limit. The schema header in packages/db/src/schema/plugin.ts says so in one line, and no migration ships.

## Evidence

Filled at landing: what ran and where its output is.
