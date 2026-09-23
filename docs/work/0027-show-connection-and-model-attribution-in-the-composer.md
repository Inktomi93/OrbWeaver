---
kind: work
status: open
updated: 2026-09-23
priority: P1
area: client
---

# Show connection and model attribution in the composer and message transcript

## What

Add a quiet running-on line to the room composer that names the connection and model the next turn will use. It gets distinct wording for three states: no connection set, connection blocked, and a shared room running on the host's connection. Let each assistant message reveal the connection, provider and model that generated it. Read these from the snapshot stored with that swipe, so the attribution stays correct after the connection is renamed or deleted. In shared rooms, say at the image affordance that generated pictures stay in the room, and give the room gallery a filter that shows only that room's pictures.

## Why

The server already stores connection id, provider and model with every assistant swipe, but the client throws most of it away. The composer shows nothing about what will run next. The transcript shows only an optional model icon and drops connection and provider entirely. Shared rooms never tell members that generated images live in the room, so people cannot find them or filter to that room.

## Done when

The composer shows a running-on line with the connection and model name. It uses distinct wording when no connection is set, when the connection is blocked, and when a shared room runs on the host's connection. Hovering or opening an assistant message shows the connection, provider and model from that swipe's stored data. This holds after a swipe change, after the source connection is renamed or deleted, and on imported or user-authored messages that have no attribution, which show a clear empty state. A shared room's image affordance states that generated pictures live in the room, and the room gallery has a filter that narrows to that room's pictures. Rendered component tests cover all of this at mobile density, cover keyboard access and screen-reader names, and cover a room whose messages come from mixed providers.

## Evidence

Filled at landing: what ran and where its output is.
