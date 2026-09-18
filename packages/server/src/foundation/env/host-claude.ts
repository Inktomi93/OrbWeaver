// The HOST-CLAUDE BACKEND POSTURE resolver — `CLAUDE_BACKEND`, the one knob that decides whether the
// agent-sdk (max-pro-sub) backend is registered at all. Pure (raw values injected, no `process.env` read
// and no `fs` call here), the `posture.ts` / `bind.ts` / `fallback-peers.ts` shape: a resolver + derived
// predicates + a warning list, all unit-testable. `foundation/env` owns the ONE process.env read and the
// one credentials-file stat, and calls this with both; `entry/lifecycle` composes + logs.
//
// ── WHY THIS FILE EXISTS (the 2026-09-18 production container) ────────────────────────────────────────────
// The agent-sdk backend was registered UNCONDITIONALLY, so the boot catalog-refresh check
// (`transport/jobs/catalog-refresh-scheduler.ts` → the `refresh-model-catalog` workload →
// `connection.refreshAgentSdkCatalog` → `infra/providers/backends/agent-sdk/catalog.ts`) forked the bundled
// `claude` runtime on EVERY container start, on a box that had no Claude credential of any kind. The child
// could only ever fail; the observed tell was a stray `claude` process plus
// "agent-sdk model discovery: turn teardown did not complete". Gating REGISTRATION is what stops it: an
// unregistered key makes `requireBackend` throw a typed error before any spawn, and the catalog workload's
// `allSettled` already treats one dead lane as a reported null.
//
// ── THE THREE ARMS (owner refinement 2026-09-18: an EXPLICIT knob first, detection second) ────────────────
//   off    the backend is never registered and never spawns, whatever is on the box. The operator said no.
//   auto   (default) registered when a credential is DETECTED; otherwise not registered, and the surface
//          says "not set up" with the how-to. Nothing spawns while undetected.
//   on     registered regardless of detection — the operator asserts a credential the detection cannot see.
//          The first USE runs the SDK's own auth probe and reports honestly; we do not second-guess it.
//
// ── DETECTION IS A HINT, NEVER A VERDICT ──────────────────────────────────────────────────────────────────
// On macOS the Claude Code login lives in the KEYCHAIN, not in `.credentials.json`
// (https://code.claude.com/docs/en/authentication, "Credential management"), so a file probe calls a
// signed-in Mac "not detected". That is exactly why `on` exists and why the `auto` warning names it. The
// file path itself is derived from `CLAUDE_CONFIG_DIR` when set, else `homedir()/.claude` — the SDK's own
// rule, and the one that makes Windows (`%USERPROFILE%\.claude`) work without a platform branch here.
//
// ── ANTHROPIC_API_KEY IS DETECTED BUT DOES NOT REGISTER (owner-confirmed fork, 2026-09-18) ────────────────
// It is the SDK's HIGHEST-precedence credential source, so an operator who set it deserves to be told why
// the backend is still off — but `infra/providers/backends/agent-sdk/env.ts::buildClaudeSdkEnv` pins
// `ANTHROPIC_API_KEY: undefined` BY DESIGN: `max-pro-sub` is the flat-rate subscription path, and the
// metered first-party key has its own builder (`buildClaudeAnthEnv`, mode-4) that is not wired to a
// credential source. Registering on an API key would spawn a child that cannot authenticate — the exact
// bug this file removes — and passing it through instead would silently move the sub's traffic onto a
// metered key, which is a billing decision nobody made. So: reported, warned, never a registration.
// `CLAUDE_BACKEND=on` remains the override for every case detection gets wrong.

import { join } from "node:path";

/** The `CLAUDE_BACKEND` knob's vocabulary. `auto` is the default: detect, and stay quiet when absent. */
export const CLAUDE_BACKEND_POSTURES = ["off", "auto", "on"] as const;
// @orb-waive no-inline-types(ClaudeBackendPosture): the §7.5 keystone — this derived type MUST co-locate with its `as const` tuple, and CLAUDE_BACKEND_POSTURES is a server-foundation env axis (not a cross-boundary contract), so its one home is here beside the tuple it derives from (the `EnginesPosture` precedent in posture.ts). Ends when the posture axis becomes a cross-boundary contract and the tuple moves to @orb/contracts with it.
export type ClaudeBackendPosture = (typeof CLAUDE_BACKEND_POSTURES)[number];

/** The SUBSCRIPTION credential sources — exactly the two the mode-1 (`max-pro-sub`) spawn can authenticate
 *  with, in the order it prefers them. `ANTHROPIC_API_KEY` is deliberately NOT a member: it is a metered
 *  first-party key that mode-1 pins `undefined` (the header), so putting it here would let a detection
 *  precedence decide a registration it can never honour. It rides its own boolean instead. */
export const HOST_CLAUDE_CREDENTIAL_SOURCES = ["oauth-token", "config-file"] as const;
// @orb-waive no-inline-types(HostClaudeCredentialSource): same §7.5 keystone as ClaudeBackendPosture above — the derived type co-locates with its `as const` tuple in the foundation env axis that owns it. Ends when the axis becomes a cross-boundary contract.
export type HostClaudeCredentialSource = (typeof HOST_CLAUDE_CREDENTIAL_SOURCES)[number];

/** The raw values the resolver reads — passed in so this file touches neither `process.env` nor `fs`. */
export interface HostClaudeInput {
  /** `CLAUDE_BACKEND`; `undefined` ⇒ the `auto` default. */
  readonly posture: ClaudeBackendPosture | undefined;
  /** `ANTHROPIC_API_KEY` is set to a non-empty value. Detected and reported; never a registration (header). */
  readonly anthropicApiKeySet: boolean;
  /** `CLAUDE_CODE_OAUTH_TOKEN` is set to a non-empty value — the `claude setup-token` headless credential. */
  readonly oauthTokenSet: boolean;
  /** `<configDir>/.credentials.json` is READABLE right now (the `claude login` file, absent on macOS). */
  readonly credentialsFileReadable: boolean;
  /** The resolved config dir (`CLAUDE_CONFIG_DIR` ?? `homedir()/.claude`) — a path, safe to log. */
  readonly configDir: string;
}

/** The composed posture. Every field is a fact about this boot, safe to print in a boot log — the token
 *  VALUES never enter this shape, only whether one is set (the `diagnostics.ts` rule). */
export interface HostClaudePosture {
  readonly posture: ClaudeBackendPosture;
  /** The SUBSCRIPTION credential the detector found, or `null`. Under `on` this stays honest: `null` means
   *  "the operator asserted one we cannot see" (a Keychain login), never "there is none". */
  readonly credential: HostClaudeCredentialSource | null;
  /** `ANTHROPIC_API_KEY` was set. Reported so the boot log can explain why it changed nothing. */
  readonly anthropicApiKeySet: boolean;
  /** Is the agent-sdk backend REGISTERED for this boot? `false` ⇒ nothing constructs it and nothing spawns. */
  readonly registered: boolean;
  /** The config dir the SDK child and the proactive token refresh both use. */
  readonly configDir: string;
}

/** The env var carrying the long-lived `claude setup-token` credential — ONE home for the name, because
 *  the detector (`foundation/env`), the mode-1 child-env builder (`agent-sdk/env.ts`) and the firewall's
 *  reserved-key belt all have to mean the same variable. A BEARER credential: the NAME lives here, the
 *  VALUE never enters this module. */
export const HOST_CLAUDE_OAUTH_TOKEN_ENV = "CLAUDE_CODE_OAUTH_TOKEN";

/** The credentials FILE's name inside the config dir — the SDK's own spelling, one home for the three
 *  readers (this detector, the mode-1 isolation symlink, the proactive OAuth refresh). */
export const HOST_CLAUDE_CREDENTIALS_FILE = ".credentials.json";

/** The config dir's one rule — `CLAUDE_CONFIG_DIR` when set, else `<home>/.claude`. `node:path.join` so
 *  Windows (`%USERPROFILE%\.claude`) resolves with the platform separator rather than a Linux-shaped
 *  literal. An empty `CLAUDE_CONFIG_DIR` is honestly "unset", never "the process cwd". */
export function hostClaudeConfigDir(configDirEnv: string | undefined, homeDir: string): string {
  const raw = (configDirEnv ?? "").trim();
  return raw.length > 0 ? raw : join(homeDir, ".claude");
}

/** `<configDir>/.credentials.json` — the `claude login` file the detector stats and the refresher writes. */
export function hostClaudeCredentialsPath(configDir: string): string {
  return join(configDir, HOST_CLAUDE_CREDENTIALS_FILE);
}

/** The DETECTION half, alone — which SUBSCRIPTION credential the mode-1 spawn would authenticate with (see
 *  the header: a HINT, never a verdict). The file arm is second because the token is the deploy-shaped one;
 *  the builder's own preference is the opposite (it prefers the file it actively refreshes) and that
 *  asymmetry is deliberate: this answers "can it log in at all", not "with which one". */
function detectSubscriptionCredential(input: HostClaudeInput): HostClaudeCredentialSource | null {
  if (input.oauthTokenSet) {
    return "oauth-token";
  }
  return input.credentialsFileReadable ? "config-file" : null;
}

export function resolveHostClaudePosture(input: HostClaudeInput): HostClaudePosture {
  const posture = input.posture ?? "auto";
  // Registration keys on the SUBSCRIPTION credential ALONE. An `ANTHROPIC_API_KEY` beside it neither
  // enables (mode-1 pins that variable undefined) nor SUPPRESSES it — a box carrying both is a working box,
  // and letting the key win a detection precedence here would have turned it into an unregistered one.
  const credential = detectSubscriptionCredential(input);
  const registered = posture === "on" || (posture === "auto" && credential !== null);
  return { posture, credential, anthropicApiKeySet: input.anthropicApiKeySet, registered, configDir: input.configDir };
}

/** The ONE boot-log line stating what this box's host-Claude backend is doing. Always present (the
 *  `bind.ts` notice contract): the whole point of this work is that an operator can read WHY the Claude
 *  backend is or is not there, and a silent absence is the state that produced the incident. Names the
 *  credential SOURCE, never a value. */
export function hostClaudeNotice(posture: HostClaudePosture): string {
  if (posture.posture === "off") {
    return "host-Claude backend OFF (CLAUDE_BACKEND=off) — not registered, nothing spawns.";
  }
  if (!posture.registered) {
    return (
      "host-Claude backend NOT SET UP — no subscription credential detected, so the backend is not registered and the bundled claude runtime is never spawned. " +
      `Run \`claude setup-token\` on any machine with a browser and set CLAUDE_CODE_OAUTH_TOKEN, or \`claude login\` into ${posture.configDir}. ` +
      "Already signed in on this machine (macOS keeps the login in the Keychain, not a file)? Set CLAUDE_BACKEND=on."
    );
  }
  const via = posture.credential ?? "operator-asserted (CLAUDE_BACKEND=on; no credential detected on this box)";
  return `host-Claude backend REGISTERED via ${via} (config dir ${posture.configDir}).`;
}

/** The operator-facing WARNINGS — EMPTY when nothing needs saying, so a healthy boot logs the notice above
 *  and nothing else (the `diagnostics.ts` contract). */
export function hostClaudeWarnings(posture: HostClaudePosture): readonly string[] {
  const warnings: string[] = [];
  // Only when the key is the ONLY thing there — beside a working subscription credential it is simply
  // inert, and a warning on a healthy box is noise that trains operators to skip warnings.
  if (posture.posture !== "off" && posture.anthropicApiKeySet && posture.credential === null) {
    warnings.push(
      "ANTHROPIC_API_KEY is set, but the host-Claude backend authenticates with a Claude SUBSCRIPTION login, not a metered API key — the key is ignored by that spawn and does not enable the backend. " +
        "Run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN, or `claude login` into the config dir.",
    );
  }
  if (posture.posture === "on" && posture.credential === null) {
    warnings.push(
      "CLAUDE_BACKEND=on with no credential detected on this box — the backend is registered on your word and the first use will run the SDK's own auth probe. If you are not signed in, that turn fails with the runtime's auth error.",
    );
  }
  return warnings;
}
