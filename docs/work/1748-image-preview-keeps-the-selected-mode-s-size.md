---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: client
plan: unwired-code
---

# Image preview keeps the selected mode's size, and a backend that ignores the count tells the user why one image came back

## What

Keep the selected mode's image size on the image preview request, and show a note when the backend ignores the image count and returns one image.

## Why

The preview should show what the selected mode would produce, and a single image from a backend that ignores the count reads as a failure unless the screen says why.

## Done when

A component test previews with a non-default size and sees the request carry it. A preview that returns one image for a higher count shows a line that says the backend ignored the count.

## Evidence

Filled at landing: what ran and where its output is.
