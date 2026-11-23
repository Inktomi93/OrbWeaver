---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# The unions slot reader reads indexed and computed slot types

## What

The 3921 real-tree triage found unions slots the reader cannot read: an indexed access over a zod output alias (PluginView updateSource, PLUGIN_UPDATE_SOURCES), an indexed access over an awaited return type's element (FsEntry kind, FS_DIR), a mapped registry whose row type is a conditional over its key (SCOPING), an unannotated const handed on through a shorthand property (INBOX), and a generic knob instantiation that reads no tuple (RULE_PRESET). Each leaves its literal crediting nothing.

## Why

Each shape is a lost credit: a member built only this way reads as unwired.

## Done when

Each shape reads its tuple through the type it names, with a planted case per shape that is red without it and a twin tuple that stays uncredited, or a ruling names a shape as unread on purpose and lists it under the unions report's limits.

## Evidence

Filled at landing: what ran and where its output is.
