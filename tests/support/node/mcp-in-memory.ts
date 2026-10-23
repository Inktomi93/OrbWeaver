// support/mcp-in-memory — drive an in-process MCP server the way the Agent SDK does, over JSON-RPC, with no
// subprocess and no extra dependency. `@orb/inference` mounts a chat turn's tools as the SDK's own
// `McpSdkServerConfigWithInstance` (`{ type: "sdk", name, instance }`); the SDK runtime talks to `instance` over
// a transport, so a test that calls a handler directly would skip exactly the layer that matters — the server's
// own argument validation and its conversion of a handler throw into an `isError` result. This connects a
// minimal in-memory transport to `instance` and speaks `initialize` → `notifications/initialized` →
// `tools/call`, which is the SDK's own sequence.
//
// LOUD on a shape miss: a mount that is not an SDK server config, or a server that never answers, throws — a
// silently-absent handler would make every assertion built on it vacuous.

/** The mounted server out of an Agent SDK tool-server config. */
/** A `tools/call` result, checked rather than cast: every block must be text (the only kind the mount emits). */
/** Connect to the in-process server behind an Agent SDK tool-server config and hand back a `tools/call` client. */
export {};
