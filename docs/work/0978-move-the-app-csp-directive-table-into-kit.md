---
kind: work
status: open
updated: 2026-10-12
priority: P3
---

# Move the app CSP directive table into kit

## What

The server's app CSP directive table in entry/http security headers is copied in the sandbox-frame CT because a CT cannot import the server entry. Move the table to @orb/kit, have the server and the CT both read it, and delete the copy.

## Why

A CSP copy in a test drifts from the policy production serves.

## Done when

One CSP directive table in kit; the server headers and the CT read it; the copy is gone.

## Evidence

Filled at landing: what ran and where its output is.
