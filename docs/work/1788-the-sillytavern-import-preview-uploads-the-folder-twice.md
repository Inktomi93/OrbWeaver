---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: client
plan: unwired-code
---

# The SillyTavern import preview uploads the folder twice

## What

Upload the SillyTavern folder once, and let the preview and the import share the staged upload.

## Why

The preview sends the folder to the server, and the import sends it again, so a large profile crosses the network twice.

## Done when

A test that previews and then imports one folder counts one upload request for it, and the import runs from the staged copy.

## Evidence

Filled at landing: what ran and where its output is.
