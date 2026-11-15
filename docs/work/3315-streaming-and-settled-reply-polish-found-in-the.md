---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# Streaming and settled reply polish found in the live stream review

## What

Five small defects seen while streaming live replies. The chat list preview shows the model's raw tags. The edit box for a long styled reply grows to thousands of pixels with Save far below. The connection row, the generation credit and the role picker show the raw model id where the add dialog showed its name. The settled reasoning disclosure loses its measured "Thought for" label. Leaving a new unsent room leaves a query polling the discarded room, which logs an error.

## Why

Each is small, but together they make the transcript and settings read as unfinished.

## Done when

Previews strip markup. The edit box caps its height and scrolls inside. The model's display name shows wherever the raw id shows today. The settled disclosure keeps the measured duration when one was recorded. Leaving an unsent room cancels its queries with no console error.

## Evidence

Filled at landing: what ran and where its output is.
