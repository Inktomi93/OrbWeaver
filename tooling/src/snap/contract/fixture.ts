// The fixture-stack shapes (--contexts/--as): where the multi-user fixture answers + its health verdict.
/** Where the fixture answers: its server origin (health/auth-config/login) + the vite origin the browser
 *  navigates. Resolved ONCE per run and threaded through the status probe, the login door and `opts.base`
 *  — the coupling that was missing when SNAP_FIXTURE_SERVER_URL existed but nothing read it. */
export interface FixtureTarget {
  readonly serverUrl: string;
  readonly baseUrl: string;
  /** The server origin's TCP port — the `/proc` env-pin check needs the number, not the URL. */
  readonly serverPort: number;
}

/** Explicit (CLI-flag) overrides; `null`/absent falls through to env, then to the offset-pair defaults. */
export interface FixtureTargetOverride {
  readonly serverUrl?: string | null;
  readonly baseUrl?: string | null;
}

export type FixtureStatus = { readonly up: true } | { readonly up: false; readonly reason: string };
