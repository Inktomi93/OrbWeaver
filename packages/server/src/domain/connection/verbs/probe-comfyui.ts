// verb: probeComfyui (MA-8/D96) — the live ComfyUI reachability + catalog probe. Delegates to the injected
// `probeComfyui` op (bound at the composition root to `infra/providers.probeComfyuiObjectInfo` over the owner-
// configured endpoint). The endpoint is deployment-global + owner-configured — no per-user scope, no owned id;
// the authed principal gates access at the transport. Never throws: an unreachable/unconfigured engine
// resolves to the `engine-off` tri-state arm, a checkpoint-less engine to `ok-but-empty`.

import type { ConnectionContext } from "../context";
import type { ProbeComfyuiParams } from "../contract/params";
import type { ConnectionService } from "../contract/service";

export function createProbeComfyui(ctx: ConnectionContext): ConnectionService["probeComfyui"] {
  return (_params: ProbeComfyuiParams) => ctx.probeComfyui();
}
