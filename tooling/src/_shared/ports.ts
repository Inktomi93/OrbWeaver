// THE PORT REGISTRY — the ONE home for every TCP port this repo's tooling, harnesses and runners bind
// (docs/design/1208-instrument-substrate.md §3.6, pain P10). Before this module the box's ports were
// 47 hand-picked literals spread across tooling/src, tests/e2e/support, both playwright configs and the
// shell launchers, with no table anywhere: picking a pair meant grepping and hoping, and the design's
// tenth stage band would have been the fifth hand-picked pair in a row.
//
// TWO KINDS OF ROW, and the distinction is the whole point:
//   RESERVED — a fixed port some named thing already owns (the dev pair, the multi-user fixture, the three
//     e2e auth-mode stacks + their scripted provider, model-ab, the CT vite, the vLLM fleet). These are
//     DECLARED here and consumed by name; nothing may ever be allocated onto one.
//   BANDS — the allocatable range. `STAGE_BANDS` is 0..9; band k is server 8888 + 10k / vite 5273 + 10k.
//     An allocator hands out a FREE band, so a lane's stage is private by construction rather than by the
//     one-fixed-pair convention that made a sibling's idle marker a hard block (#1163, #1186).
//
// THE INVARIANT THIS MODULE EXISTS TO MAKE PROVABLE: the band ports and the reserved ports are DISJOINT.
// It holds today only because the two bases were chosen above every reserved number and the stride is
// small enough not to reach the next decade — i.e. by arithmetic nobody wrote down. `RESERVED_PORT_NUMBERS`
// and `stageBandPorts` are exported as data precisely so `tests/tooling/_shared/ports.test.ts` can assert
// the disjointness instead of a future edit discovering it at 2am on a bound port.
//
// PURE — no env, no I/O, no imports. Every consumer that ALSO honours an env override (PORT, VITE_PORT,
// FIXTURE_PORT, SNAP_BASE_URL, …) keeps that override at its own call site and uses these as the default.
//
// THE MIRROR SIDE, which this module cannot own — FOUR files, and the two reasons are DIFFERENT (owner
// ruling 2026-09-02, #1271: house precedent, no env file and no move into @orb/kit; the `tooling-shared-
// plumbing` arm-I gate excludes all four BY RULING, not as a deferral):
//   • BY LANGUAGE — three shell launchers spell the same defaults in bash and cannot import a TS module:
//     `tooling/src/stack/stack.sh` (8788/5173), `tooling/src/stack/multi-user-fixture.sh` (8790/5175) and
//     `tooling/src/stack/engines.sh` (8701-8703). `STACK_SPAWNERS` (tooling/src/stack/lib/spawners.ts)
//     reads THIS table, so `stack status` can still name whoever holds a port; a drifted shell default
//     shows up there, and `tests/tooling/snap/ops/fixture.test.ts` asserts the fixture pair in lockstep.
//   • BY CAKE — `packages/client/vite.config.ts` (`5173`, `http://127.0.0.1:8788`). `tooling` sits ABOVE
//     the package cake, so importing `@orb/tooling` from `packages/**` is an UPWARD import and is
//     automatically wrong (constitution §2) — this is a boundary, not a preference. Those two values are
//     env-overridable DEFAULTS there (`VITE_PORT`, `VITE_API_TARGET`), not hardcodes; the fallbacks must
//     match DEV_PORTS above. That file carries the pointer back to this one.

/** The protocol's own ceiling — the largest number a TCP port can BE, not a port anything binds. It lives
 *  here because this is the one home for port FACTS: a validator that re-spells 65535 at its own call site
 *  is the same hand-picked-number class as a re-spelled 8701, and `tooling-port-registry` reads a
 *  port-named position regardless of whether the value is allocatable. Deliberately NOT a `RESERVED_PORTS`
 *  row: nothing owns it, so the disjointness pin must never see it. */
export const MAX_TCP_PORT = 65_535;

/** A server/vite pair — the shape every stack in this repo binds. */
export interface PortPair {
  readonly server: number;
  readonly vite: number;
}

/** What a reserved port is FOR. `provider` is the scripted BYO-provider stub (not an orbweaver server);
 *  `engine` is a vLLM process, which has no vite side at all. The AXIS is the tuple; the union DERIVES
 *  from it, so a new role is added in exactly one place and every dispatch over it fails to compile until
 *  it is handled (Spine-TypeScript §"String-union dispatch discipline"). */
export const PORT_ROLES = ["server", "vite", "engine", "provider"] as const;
export type PortRole = (typeof PORT_ROLES)[number];

/** One reserved port: who owns it and why nothing else may take it. */
export interface ReservedPort {
  readonly port: number;
  readonly owner: string;
  readonly role: PortRole;
  readonly why: string;
}

// ── the reserved rows, by name (this is the consumer surface) ─────────────────────────────────────────

/** The dev stack `pnpm stack up` binds (mirrors `stack.sh` BACKEND_PORT/VITE_PORT + vite.config strictPort).
 *  `:5173` serves MAIN, never a lane's branch (constitution §L.6) — a lane measures a stage band instead. */
export const DEV_PORTS: PortPair = { server: 8788, vite: 5173 };

/** The multi-user fixture stack (`multi-user-fixture.sh`) — an OFFSET pair so it can run beside dev. */
export const FIXTURE_PORTS: PortPair = { server: 8790, vite: 5175 };

/** The three e2e auth-mode projects (`tests/e2e/support/modes.ts`). Each boots its own `stack.sh start-fg`
 *  with an isolated DB, so all three pairs must be free simultaneously during `pnpm e2e`. */
export const E2E_PORTS: Readonly<Record<"singleUser" | "forwardHeader" | "local", PortPair>> = {
  singleUser: { server: 8796, vite: 5181 },
  forwardHeader: { server: 8798, vite: 5182 },
  local: { server: 8799, vite: 5183 },
};

/** The scripted fixture PROVIDER's loopback port (`tests/e2e/support/fixture-provider.ts`) — fixed so the
 *  local stack's egress allowlist can name it. Not an orbweaver server, so it has no vite side. */
export const E2E_FIXTURE_PROVIDER_PORT = 8797;

/** model-ab's own offset server (`tooling/src/model-ab/ops/serve.ts`) — never the fleet's, never a band's. */
export const MODEL_AB_PORT = 8901;

/** The playwright-ct vite. A CT run has no orbweaver server: this is the whole of its port surface. */
export const CT_VITE_PORT = 3100;

/** The vLLM fleet (`engines.sh`). The stage ADOPTS the shared fleet rather than offsetting it, so these are
 *  reserved for everyone at once — a band that landed on one would kill the box's models mid-run. */
export const ENGINE_PORTS: Readonly<Record<"embed" | "rerank" | "generate", number>> = {
  embed: 8701,
  rerank: 8702,
  generate: 8703,
};

// ── the reserved table (derived from the named rows above — never a second spelling) ──────────────────

export const RESERVED_PORTS: readonly ReservedPort[] = [
  {
    port: DEV_PORTS.server,
    owner: "dev stack",
    role: "server",
    why: "`pnpm stack up`; `stack up prod` deliberately shares it — two ways to serve one app, never both at once",
  },
  { port: DEV_PORTS.vite, owner: "dev stack", role: "vite", why: "the operator's live client; serves MAIN, never a lane's branch" },
  { port: FIXTURE_PORTS.server, owner: "multi-user fixture", role: "server", why: "AUTH_MODE=local fixture stack, runs BESIDE dev" },
  { port: FIXTURE_PORTS.vite, owner: "multi-user fixture", role: "vite", why: "the fixture's client, for invite → notification → accept by hand" },
  { port: E2E_PORTS.singleUser.server, owner: "e2e single-user", role: "server", why: "the default e2e lane's isolated stack (E2E_HARNESS=on)" },
  { port: E2E_PORTS.singleUser.vite, owner: "e2e single-user", role: "vite", why: "the default e2e lane's client" },
  {
    port: E2E_FIXTURE_PROVIDER_PORT,
    owner: "e2e fixture provider",
    role: "provider",
    why: "scripted BYO provider named by the local stack's egress allowlist",
  },
  { port: E2E_PORTS.forwardHeader.server, owner: "e2e forward-header", role: "server", why: "SSO trusted-proxy mode's isolated stack" },
  { port: E2E_PORTS.forwardHeader.vite, owner: "e2e forward-header", role: "vite", why: "SSO trusted-proxy mode's client" },
  { port: E2E_PORTS.local.server, owner: "e2e local", role: "server", why: "cookie/BFF mode's isolated stack" },
  { port: E2E_PORTS.local.vite, owner: "e2e local", role: "vite", why: "cookie/BFF mode's client" },
  { port: MODEL_AB_PORT, owner: "model-ab", role: "server", why: "the A/B harness's own offset server" },
  { port: CT_VITE_PORT, owner: "playwright-ct", role: "vite", why: "the CT runner's vite; no orbweaver server exists in a CT run" },
  { port: ENGINE_PORTS.embed, owner: "vLLM fleet", role: "engine", why: "embedding engine — adopted by every stack, offset by none" },
  { port: ENGINE_PORTS.rerank, owner: "vLLM fleet", role: "engine", why: "rerank engine — adopted by every stack, offset by none" },
  { port: ENGINE_PORTS.generate, owner: "vLLM fleet", role: "engine", why: "generation engine — adopted by every stack, offset by none" },
];

/** Every reserved number, for the disjointness pin and for an allocator's "is this taken?" question. */
export const RESERVED_PORT_NUMBERS: ReadonlySet<number> = new Set(RESERVED_PORTS.map((row) => row.port));

/** The reserved row holding a port, for a refusal that NAMES the owner instead of printing a bare pid. */
export function reservedPort(port: number): ReservedPort | undefined {
  return RESERVED_PORTS.find((row) => row.port === port);
}

// ── the allocatable stage bands ───────────────────────────────────────────────────────────────────────

/** How many stage bands exist. Ten is the concurrency ceiling a band exhaustion message quotes; the cap on
 *  lanes is three (`.claude/rules/lane-standing-facts.md`), so this leaves headroom for a lane holding a
 *  second stage at another ref without the range ever being the binding constraint. */
export const STAGE_BAND_COUNT = 10;

/** Band k's ports are BASE + STRIDE*k. Both bases sit above every reserved number and the stride is small
 *  enough that band 9 (8978/5363) never reaches the next reserved decade — that arithmetic is the
 *  disjointness invariant, and `tests/tooling/_shared/ports.test.ts` is where it stops being an assumption. */
const STAGE_BAND_SERVER_BASE = 8888;
const STAGE_BAND_VITE_BASE = 5273;
const STAGE_BAND_STRIDE = 10;

/** `[0, 1, … 9]` — every allocatable band, in allocation order (an allocator takes the lowest FREE one). */
export const STAGE_BANDS: readonly number[] = Array.from({ length: STAGE_BAND_COUNT }, (_index, band) => band);

/** Band k's port pair. Throws on an out-of-range band rather than returning ports nobody reserved: a band
 *  index that escaped the range would silently allocate onto whatever lives at 8888 + 10k. */
export function stageBandPorts(band: number): PortPair {
  if (!Number.isInteger(band) || band < 0 || band >= STAGE_BAND_COUNT) {
    throw new RangeError(`stage band ${band} is outside 0..${STAGE_BAND_COUNT - 1} — tooling/src/_shared/ports.ts`);
  }
  return {
    server: STAGE_BAND_SERVER_BASE + STAGE_BAND_STRIDE * band,
    vite: STAGE_BAND_VITE_BASE + STAGE_BAND_STRIDE * band,
  };
}

/** Every band port, both sides, flattened — the other half of the disjointness pin. */
export const STAGE_BAND_PORT_NUMBERS: ReadonlySet<number> = new Set(
  STAGE_BANDS.flatMap((band) => {
    const ports = stageBandPorts(band);
    return [ports.server, ports.vite];
  }),
);

/** Which band a port belongs to, or null. Port-keyed because a band IS its ports — a `--base` naming the
 *  vite side and a probe naming the server side are the same claim about the same stage (#1186). */
export function stageBandForPort(port: number): number | null {
  return (
    STAGE_BANDS.find((band) => {
      const ports = stageBandPorts(band);
      return ports.server === port || ports.vite === port;
    }) ?? null
  );
}
