---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: client
plan: cross-surface-consistency
---

# Import and inbox rendered review P3 bundle (P3-1 to P3-8, inbox-and-import side-eye report), plus importTree taking an abort signal

## What

Fix the eight P3 findings of the inbox-and-import side-eye review of the SillyTavern folder import, and give importTree an abort signal. The findings: an unrecognized folder shows two alerts and a toast that says Check the file; the preflight prose has no line measure; Show names is under the control text floor and keeps its label when open; a re-pick reports ownership only for characters; the preview and the report do not reconcile; an empty folder leaves Import live with nothing in it; the preflight card is very tall and Import leaves reach; two buttons are named Import, focus falls to the page body after Import, and the running bar label is lowercase.

## Why

The review rendered the whole folder-import flow and found each of these on screen. importTree takes no abort signal, so Cancel during an upload lets the bytes finish.

## Done when

Each finding is fixed, or answered with a cited reason, and a rendered pass of the folder-import flow shows none of them. A test aborts an importTree upload and sees the request end.

## Evidence

Filled at landing: what ran and where its output is.
