// infra/providers/backends/openrouter/runners/chat/context-compression — the OpenRouter middle-out lever.
//
// LOAD-BEARING QUIRK (neo, verified live): OpenRouter enables a server-side `context-compression`
// (middle-out) transform BY DEFAULT, and `transforms:[]` does NOT disable it — the real switch is the
// `plugins` array with an explicit `{ id:"context-compression", enabled:false }` entry. Orbweaver trims the
// context deterministically upstream (the chat pipeline), so we DISABLE middle-out by default (OR must not
// middle-out on top of our trim → silent double-compaction); a user who opts in via
// `intent.providerContextCompression` flips it to an enabled middle-out engine and the pipeline skips its
// own trim.

import type { ContextCompressionPlugin } from "@openrouter/sdk/models";
import type { UserIntent } from "@orb/contracts/preset";

// The wire id of the plugin we manage (a literal the SDK type pins to `"context-compression"`).
const CONTEXT_COMPRESSION_ID = "context-compression";
const MIDDLE_OUT_ENGINE = "middle-out";

/**
 * Build the managed `plugins` entry for the request. Returns a single-element array carrying our
 * context-compression directive: enabled middle-out when the user opted in, an explicit `enabled:false`
 * (the only reliable way to suppress OR's default middle-out) otherwise. Any caller-supplied
 * context-compression entry is superseded by this managed one (we own the trim/compaction policy).
 */
export function withContextCompressionPlugin(intent: UserIntent): ContextCompressionPlugin[] {
  if (intent.providerContextCompression === true) {
    return [{ id: CONTEXT_COMPRESSION_ID, enabled: true, engine: MIDDLE_OUT_ENGINE }];
  }
  return [{ id: CONTEXT_COMPRESSION_ID, enabled: false }];
}
