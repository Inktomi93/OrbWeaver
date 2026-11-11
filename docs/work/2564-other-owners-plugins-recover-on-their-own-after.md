---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: plugins
---

# Other owners' plugins recover on their own after the plugin broker is replaced

## What

After the parent replaces the plugin broker, every other owner's resident plugin still shows as enabled but fails each call with a snippet timeout until its owner enables it again or toggles it.

## Why

A broker loss is a host event. An owner who did nothing sees a plugin that reports enabled and does not work, with no signal to act on.

## Done when

After a broker replacement, an enabled plugin of an owner who did not cause it answers its next call with no owner action. A test replaces the broker and calls a bystander plugin through the production entry; planting out the recovery turns it red. The leg 7 security review under reports/review, finding B-2, holds the probe.

## Evidence

Filled at landing: what ran and where its output is.
