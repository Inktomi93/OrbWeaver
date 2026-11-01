---
kind: work
status: open
updated: 2026-11-01
priority: P2
area: server
plan: unwired-code
---

# Wire inbox pagination, dismissed state and last seen (owner: wire)

## What

The inbox pages older rows through `createCollectionSurface`, shows arrival time on each row, lists dismissed rows through `notifications.list` with `state: "dismissed"`, and the People roster shows when an offline member was last around through `PresenceSnapshot.lastSeen`.

## Why

The owner ticked inbox pagination, dismissed state and last seen as wire. The ticked options read: `ListInboxResult.nextCursor` loads older notifications, `dismissedAt` and `createdAt` show when something arrived or was dismissed, and `PresenceView.lastSeenAt` and `userId` show when a member was last around. The unread marker already runs on `readAt`.

## Done when

- An inbox past one page shows a Load more control that loads the older rows, in the bar and sheet lenses.
- A row dismissed on one device is absent from the inbox on another and appears under Show dismissed, read-only, with its arrival and dismissal times.
- A dismissed page holds only the caller's rows and no `plugins-awaiting-consent` row, because those rows are mostly producer supersedes and retractions.
- An offline member with a last-seen time shows it on their roster row and in the row's accessible name. An online or unknown member shows none.

## Evidence

Filled at landing: what ran and where its output is.
