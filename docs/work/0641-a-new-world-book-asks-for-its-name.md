---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: client
---

# A new world book asks for its name

## What

New book creates 'New book' instantly beside a disabled 'Backfill titles' button (fp8-wi-new\.png). Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

Owner ruling: New book, New roster and New script all ask for a name inline; the shared collection create flow changes once. Backfill titles half done by lane S3.

## Why

Launch visual pass finding.

## Done when

New book asks for a name inline and Backfill titles hides until it applies.

## Evidence

Lane S3 (ece5696b52) did the Backfill-titles half: the button shows only when a blank-titled entry has keys. New book asking for a name inline is not done; it changes the shared collection create contract and landing host that New roster and New script also use, so it needs a design call.
