---
kind: tooling
status: open
updated: 2026-11-15
priority: P2
area: ci
---

# A release whose notes job fails stays a draft with no supported way to finish it

## What

In `.github/workflows/release.yml` the `image` job publishes the image before the `notes` job admits the release, appends the upgrade block and publishes it. When `notes` fails the image is public and the release is a draft. A rerun uses the workflow file at the tag, so a fix on main cannot reach it, and the only path is to repeat the job's steps by hand.

## Why

The owner's update check and the upgrade instructions read the published release. A hand finish copies shell from the workflow and can drift from it.

## Done when

One checked-in script holds the admission check, the notes block and the publication, and the `notes` job calls it. The same script finishes a named tag from a checkout, with a dry run that prints the notes. `docs/` release instructions name the command. A tooling test pins that the job and the script agree.

## Evidence

Filled at landing: what ran and where its output is.
