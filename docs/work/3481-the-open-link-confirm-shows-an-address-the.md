---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# The open-link confirm shows an address the reader cannot fully read and accepts credentials

## What

The open-link confirm for a framed reply, and for a framed card on the card parity branch, shows the posted address as one unwrapped line. A long host name hides the real domain past the dialog edge, an internationalized host shows as a lookalike while the browser opens its encoded form, and an address with a user name or password is accepted.

## Why

The confirm is the last control before leaving the app, and the reader decides by reading the address.

## Done when

The address is parsed once, an address with a user name or password is refused, the confirm shows the host on its own line and wraps the full address, and what is shown is exactly what opens. A component test covers a long host, an internationalized host and credentials through what the reader sees.

## Evidence

Filled at landing: what ran and where its output is.
