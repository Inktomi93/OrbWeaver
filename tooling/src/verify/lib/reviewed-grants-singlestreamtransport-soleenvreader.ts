// Reviewed grants: single-stream-transport, sole-env-reader.
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_SINGLESTREAMTRANSPORT_SOLEENVREADER: readonly ReviewedGateGrant[] = [
  {
    id: "single-stream-transport:chat-impersonate-stream",
    policyId: "single-stream-transport",
    subject: "packages/server/src/transport/trpc/routers/chat.ts",
    operation: "sse-subscription:impersonateStream",
    why: "PERMANENT by owner ruling (D118): request-scoped, user-gesture-initiated, at most one at a time, and its abort semantics ARE the socket teardown — folding it would mean modelling `detach = cancel generation`. This is the last survivor of the fold ledger; the six staged rows were deleted with the rooms they named.",
    endsWhen:
      "the spec is amended to fold impersonation onto the multiplexed socket; a fold that ships without deleting this row leaves it consumed zero times and reds.",
  },
  {
    id: "single-stream-transport:stream-connect",
    policyId: "single-stream-transport",
    subject: "packages/server/src/transport/trpc/routers/stream.ts",
    operation: "sse-subscription:connect",
    why: "THE one-socket home — the multiplex's own `.subscription(` lives here and every room rides it (D118). Keyed on the PROC so a SECOND subscription added to this same router is still red.",
    endsWhen:
      "the stream router moves or renames its connect proc; the row is then consumed zero times and reds at its dead identity instead of the exemption following the file.",
  },
  {
    id: "sole-env-reader:env-home-dynamic-key",
    policyId: "sole-env-reader",
    subject: "packages/server/src/foundation/env/index.ts",
    operation: "process-env-read",
    why: "THE sole reader (Tier-2-Foundation.md inv #1) — foundation/env is what parses and FREEZES `env` for every other tier, so it cannot import the frozen object it produces. This row covers the reads that name no static key: the `.env` loader's `process.env[key]` copy, the zod parse of the whole bag, and the raw snapshot the agent-sdk child env builders spread.",
    endsWhen: "the sole reader moves out of foundation/env, or stops making this read; the row is then consumed zero times and reds.",
  },
  {
    id: "sole-env-reader:env-home-orb-env-no-file",
    policyId: "sole-env-reader",
    subject: "packages/server/src/foundation/env/index.ts",
    operation: "process-env-read:ORB_ENV_NO_FILE",
    why: "THE sole reader (Tier-2-Foundation.md inv #1) — foundation/env is what parses and FREEZES `env` for every other tier, so it cannot import the frozen object it produces. The `.env` file load is skipped by this escape hatch, which must be read BEFORE the frozen object exists.",
    endsWhen: "the sole reader moves out of foundation/env, or stops making this read; the row is then consumed zero times and reds.",
  },
  {
    id: "sole-env-reader:env-home-orb-env-from-file",
    policyId: "sole-env-reader",
    subject: "packages/server/src/foundation/env/index.ts",
    operation: "process-env-read:ORB_ENV_FROM_FILE",
    why: "THE sole reader (Tier-2-Foundation.md inv #1) reads the launcher's file-provenance key before deriving the frozen auth-mode source. The claimed key must still match the loaded file's bytes; this permission licenses neither a foreign env reader nor a different static key.",
    endsWhen: "the sole reader stops consuming this launcher provenance key, or the canonical env home moves.",
  },
  {
    id: "sole-env-reader:env-home-orb-env-no-override",
    policyId: "sole-env-reader",
    subject: "packages/server/src/foundation/env/index.ts",
    operation: "process-env-read:ORB_ENV_NO_OVERRIDE",
    why: "THE sole reader (Tier-2-Foundation.md inv #1) — foundation/env is what parses and FREEZES `env` for every other tier, so it cannot import the frozen object it produces. Whether a checked-in dev `.env` overrides an already-set var is decided before the parse, so it cannot come from the parse's own output.",
    endsWhen: "the sole reader moves out of foundation/env, or stops making this read; the row is then consumed zero times and reds.",
  },
  {
    id: "sole-env-reader:env-home-vitest",
    policyId: "sole-env-reader",
    subject: "packages/server/src/foundation/env/index.ts",
    operation: "process-env-read:VITEST",
    why: "THE sole reader (Tier-2-Foundation.md inv #1) — foundation/env is what parses and FREEZES `env` for every other tier, so it cannot import the frozen object it produces. The test runner's own marker selects the no-override posture, and is read at module init before the frozen object exists.",
    endsWhen: "the sole reader moves out of foundation/env, or stops making this read; the row is then consumed zero times and reds.",
  },
];
