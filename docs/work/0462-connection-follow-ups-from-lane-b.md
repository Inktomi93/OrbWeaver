---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: connection
---

# Connection follow-ups from lane B

## What

(1) Read Ollama /api/show capabilities (tools, vision, embedding) as advertised evidence and kind, so a local model gets tools without a declaration. (2) Add an exampleBaseUrl provider-row field plus db migration for per-provider Server URL placeholders. (3) A live width probe before binding an own-server embedder whose width is unstated (dimsEstimated). (4) Zero-padding narrower embedders needs an owner ruling against the never-padded rule in the capability embedding headers; it also touches assertSpace and the search dim filter. (5) fitsSpace refuses a wider non-MRL embedder while resolveEmbed truncates it; reconcile.

## Why

Own-server gaps found by lane B outside its items' done criteria.

## Done when

Each sub-point is built or explicitly ruled, with a test where built.

## Evidence

Filled at landing: what ran and where its output is.
