// The fixture-stack shapes (--contexts/--as): where the multi-user fixture answers + its health verdict.
/** Where the fixture answers: its server origin (health/auth-config/login) + the vite origin the browser
 *  navigates. Resolved ONCE per run and threaded through the status probe, the login door and `opts.base`
 *  — the coupling that was missing when SNAP_FIXTURE_SERVER_URL existed but nothing read it. */
export interface FixtureTarget {
  readonly serverUrl: string;
  readonly baseUrl: string;
  /** The server origin's TCP port — the refusal lines name the number, not the URL. */
  readonly serverPort: number;
}

/** Explicit (CLI-flag) overrides; `null`/absent falls through to env, then to the offset-pair defaults. */
export interface FixtureTargetOverride {
  readonly serverUrl?: string | null;
  readonly baseUrl?: string | null;
}

export type FixtureStatus = { readonly up: true } | { readonly up: false; readonly reason: string };

/** The `/api/auth/config` fields the fixture probe reads (all optional — a single-user stack answers a
 *  different shape, and telling the two apart is the probe's whole job). */
export interface AuthConfig {
  readonly mode?: string;
  readonly localEnabled?: boolean;
  readonly multiHumanCapable?: boolean;
}

/** What the LIVE port owner says about its own auth mode. THREE outcomes, not two (#1507): the
 *  probe can also fail to ASK, and "could not ask" is not "answered no" and is certainly not "answered
 *  yes" — the arm the old `boolean | null` let `fixtureStatus` fall through as `{ up: true }`. Every
 *  unreadable arm carries the sentence a caller needs to act on it. */
export type PortOwnerAuthProbe =
  | { readonly kind: "local" }
  | { readonly kind: "not-local"; readonly mode: string }
  | { readonly kind: "unreadable"; readonly reason: string };
