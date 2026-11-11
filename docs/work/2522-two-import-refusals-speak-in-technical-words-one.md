---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# Two import refusals speak in technical words, one of them twice

## What

A SillyTavern folder import pointed at the wrong folder shows a toast and an inline line that disagree, both in technical wording; the owner's ruling is no toast beside a visible inline failure. A character import of a plain picture refuses with a toast that names the missing card chunk by its internal spelling. Source: the client rendered re-check report under reports/review.

## Why

A person who picked the wrong file needs to know what to pick, in their words, said once.

## Done when

The folder import refusal shows one inline sentence that says what was wrong with the folder and what a SillyTavern folder contains, with no toast. The character import refusal says the picture holds no character card and what kinds of file do. Both read their copy from the feature's copy module.

## Evidence

Filled at landing: what ran and where its output is.
