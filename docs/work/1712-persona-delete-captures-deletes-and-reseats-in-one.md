---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: server
---

# Persona delete captures, deletes and reseats in one transaction, so a seat switched onto the deleted persona after capture is not left empty

## What

Make persona delete capture the persona, delete it and reseat the affected seats in one transaction.

## Why

Delete captures the seats first and deletes later. A seat switched onto the persona between the two steps is not in the capture, so it is left with no persona.

## Done when

A test switches a seat onto the persona after the capture step and before the delete commits. After the delete the seat holds a valid persona.

## Evidence

Filled at landing: what ran and where its output is.
