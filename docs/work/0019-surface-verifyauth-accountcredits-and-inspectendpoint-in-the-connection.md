---
kind: work
status: open
updated: 2026-09-24
priority: P3
area: client
---

# Surface verifyAuth, accountCredits and inspectEndpoint in the connection editor

## What

The server exposes three connection diagnostics that no client code calls: connection.verifyAuth (mutation, served only by the agent-sdk backend for Claude-subscription rows), connection.accountCredits (query, served only by the OpenRouter openai-compat path), and connection.inspectEndpoint (mutation). Wire each one into packages/client/src/features/credentials, next to the existing connection.probe wiring in hooks/use-connections-mutations.ts and components/connection-reachability.tsx. Run verifyAuth when a Claude-subscription connection is saved and show its result. Show the accountCredits balance on the per-connection diagnostic tile of OpenRouter rows, and hide it on rows whose backend does not serve credits. For inspectEndpoint, either add an inspect action that renders the EndpointInspection result, or remove the procedure together with its router test and cross-tenant sweep rows. Record the reason for whichever you choose.

## Why

Users get no auth confirmation for subscription connections and no credit balance for OpenRouter connections, even though the server already computes both. The unused inspectEndpoint procedure widens the tRPC surface and the cross-tenant sweep without any product caller.

## Done when

`rg -n "verifyAuth|accountCredits" packages/client` finds live calls in the credentials feature. A CT or unit test shows that saving a Claude-subscription connection calls verifyAuth and renders its result. A test shows that an OpenRouter row renders the accountCredits balance and that a row on another backend does not request it. inspectEndpoint either has a client caller with a test that renders its result, or it is gone from packages/server/src/transport/trpc/routers/connection.ts along with its router-test and cross-tenant-sweep entries.

## Evidence

Filled at landing: what ran and where its output is.
