// Where every production parse input reaches a test root: a harness option writes it, the harness composes it, or no
// root reaches it by design. The table is a `Record` over the schema's keys and the machine's facts, so a new key or
// fact fails `tsc` until it is placed.

import { join } from "node:path";
import type { LogLevel } from "@orb/contracts/settings";
import type { SessionsRolePolicyConfig } from "@orb/server/domain/sessions";
import type { createConfiguredOidc, ServicesDeps } from "@orb/server/entry/compose";
import type { Env, EnvKey, HostFacts } from "@orb/server/foundation/env/record";
import { ENV_KEYS } from "@orb/server/foundation/env/record";
import { createTestEnv } from "./env.ts";

interface EnvSeamValues extends Required<Pick<ServicesDeps, "casDir" | "importStagingDir">> {
  /** The process logger is borrowed at the same level for the root's lifetime. */
  readonly logLevel: LogLevel;
  readonly rpgTrace: boolean;
  readonly wireCapture: boolean;
  readonly wireCaptureReply: boolean;
  readonly debugToken: string;
  readonly clientDistDir: string;
  readonly bindHost: string;
  readonly allowPublicBind: boolean;
  readonly rolePolicyConfig: Partial<SessionsRolePolicyConfig>;
  /** The OIDC client keys, which the configured client and every other reader of them take from the record. */
  readonly oidc: Parameters<typeof createConfiguredOidc>[0]["settings"];
}

/** The harness options that write record keys, beside `env`, which takes a key's raw value as written. The machine's
 *  facts are typed values the process reader reads, never env text: a root states `containerMarker` (default absent)
 *  and `hostname` (default a fixed test name) as options. */
export type EnvSeamOptions = Partial<EnvSeamValues & HostFacts>;

type NamedSeamOption = keyof EnvSeamValues;

/** The root facts a composed key derives from. */
interface RootFacts {
  readonly rootDir: string;
}

interface OptionSeam<Option extends NamedSeamOption> {
  readonly kind: "seam";
  readonly option: Option;
  readonly raw: (options: EnvSeamOptions) => string | undefined;
}

interface RawSeam {
  readonly kind: "seam";
  readonly option: "env";
}

interface HostFactSeam<Fact extends keyof HostFacts> {
  readonly kind: "seam";
  readonly option: Fact;
}

interface ComposedSeam {
  readonly kind: "composed";
  /** How the harness derives the key; a key the parse derives from another key carries no `compose`. */
  readonly derivation: string;
  readonly compose?: (root: RootFacts) => string;
}

// Why no test root reaches a key.
const DEPLOY_ONLY_REASONS = {
  listener: "the root listens on an ephemeral loopback port through `listen()`",
  "boot-step": "only a boot step in `entry/lifecycle.ts` reads it, and a test root runs none of them",
  "boot-secret": "boot resolves the secret from the key or its keyfile; the root injects a fixed one",
  "injected-database": "the root composes over the database it is handed, or a fresh in-memory one",
} as const;

interface DeployOnlySeam {
  readonly kind: "deploy-only";
  readonly reason: keyof typeof DEPLOY_ONLY_REASONS;
}

type EnvSeam = OptionSeam<NamedSeamOption> | RawSeam | ComposedSeam | DeployOnlySeam;

function onOff(flag: boolean): "on" | "off" {
  return flag ? "on" : "off";
}

function seam<Option extends NamedSeamOption>(option: Option, read: (value: EnvSeamValues[Option]) => string | undefined): OptionSeam<Option> {
  return {
    kind: "seam",
    option,
    raw: (options): string | undefined => {
      const value = options[option];
      return value === undefined ? undefined : read(value);
    },
  };
}

const RAW: RawSeam = { kind: "seam", option: "env" };

function hostFact<Fact extends keyof HostFacts>(fact: Fact): HostFactSeam<Fact> {
  return { kind: "seam", option: fact };
}

function composed(derivation: string, compose?: (root: RootFacts) => string): ComposedSeam {
  return compose === undefined ? { kind: "composed", derivation } : { kind: "composed", derivation, compose };
}

function deployOnly(reason: DeployOnlySeam["reason"]): DeployOnlySeam {
  return { kind: "deploy-only", reason };
}

// The settings are parsed values; the record takes their raw spelling, which the parse reads back to the same values.
function oidcKey(key: keyof EnvSeamValues["oidc"]): OptionSeam<"oidc"> {
  return seam("oidc", (settings) => (settings[key] === undefined ? undefined : String(settings[key])));
}

function rolePolicyKey(key: keyof SessionsRolePolicyConfig): OptionSeam<"rolePolicyConfig"> {
  return seam("rolePolicyConfig", (config) => config[key]);
}

const ST_PROFILE_DIR_NAME = "st-profile";
const HARNESS_IDENTITY_PROVIDER = "Harness identity provider";

/** Every env key and how a test root reaches it. */
export const ENV_SEAMS = {
  ["PORT"]: deployOnly("listener"),
  ["NODE_ENV"]: RAW,
  ["PLUGIN_BROKER_WORKER_MAX"]: RAW,
  ["PLUGIN_BROKER_MEMORY_LIMIT_BYTES"]: RAW,
  ["BIND_HOST"]: seam("bindHost", (host) => host),
  ["ALLOW_DEV_PUBLIC_BIND"]: seam("allowPublicBind", String),
  ["OPENROUTER_API_KEY"]: deployOnly("boot-step"),
  ["LOG_LEVEL"]: seam("logLevel", (level) => level),
  ["DEBUG_TOKEN"]: seam("debugToken", (token) => token),
  ["RPG_TRACE"]: seam("rpgTrace", onOff),
  ["WIRE_CAPTURE"]: seam("wireCapture", onOff),
  ["WIRE_CAPTURE_REPLY"]: seam("wireCaptureReply", onOff),
  ["E2E_HARNESS"]: RAW,
  ["E2E_FIRST_RUN_ASK_HANDLES"]: RAW,
  ["DEV_SEED"]: RAW,
  ["SEED_CONTENT"]: RAW,
  ["ORB_CONTAINER"]: RAW,
  ["DATA_DIR"]: composed("the root's own temporary directory, under `temporaryParentDir` when one is given", ({ rootDir }) => rootDir),
  ["DATABASE_URL"]: deployOnly("injected-database"),
  ["DATA_LAYOUT_SKIP"]: deployOnly("boot-step"),
  ["CLIENT_DIST_DIR"]: seam("clientDistDir", (dir) => dir),
  ["ASSETS_DIR"]: seam("casDir", (dir) => dir),
  ["LOCAL_LIGHT_CACHE_DIR"]: composed("the parse's model slot under `DATA_DIR`; the root exposes it as `modelCacheDir`"),
  ["LOCAL_LIGHT_CPU_PERCENT"]: RAW,
  ["LOCAL_LIGHT_PREFETCH"]: deployOnly("boot-step"),
  ["LOCAL_LIGHT_EMBED_DTYPE"]: RAW,
  ["IMPORT_STAGING_DIR"]: seam("importStagingDir", (dir) => dir),
  ["ST_PROFILE_DIR"]: composed("a directory under the root's own, so no root reads the checkout's profile snapshot", ({ rootDir }) =>
    join(rootDir, ST_PROFILE_DIR_NAME),
  ),
  ["USER_RUNTIME_DIR"]: composed("the parse's users slot under `DATA_DIR`"),
  ["PRIVATE_ENDPOINT_ALLOWLIST"]: RAW,
  ["CORPUS_AUTOINDEX"]: RAW,
  ["IMPORT_SKIP_CHARACTERS"]: RAW,
  ["DEFAULT_USER_HANDLE"]: rolePolicyKey("DEFAULT_USER_HANDLE"),
  ["AUTH_MODE"]: RAW,
  ["AUTH_FALLBACK"]: RAW,
  ["AUTH_BREAK_GLASS"]: RAW,
  ["AUTH_FALLBACK_TRUSTED_PEERS"]: RAW,
  ["TRUSTED_PRIVATE_RANGES"]: RAW,
  ["LOCAL_INITIAL_PASSWORD"]: deployOnly("boot-step"),
  ["FORWARD_AUTH_TRUSTED_PROXIES"]: RAW,
  ["FORWARD_AUTH_USER_HEADER"]: RAW,
  ["FORWARD_AUTH_GROUPS_HEADER"]: RAW,
  ["FORWARD_AUTH_UID_HEADER"]: RAW,
  ["FORWARD_AUTH_EMAIL_HEADER"]: RAW,
  ["IP_ALLOWLIST"]: RAW,
  ["ALLOWED_HOSTS"]: RAW,
  ["SHARE_RELAY"]: deployOnly("boot-step"),
  ["EGRESS_FIREWALL"]: RAW,
  ["EGRESS_ALLOWLIST"]: RAW,
  ["OWNER_GROUP"]: rolePolicyKey("OWNER_GROUP"),
  ["OWNER_HANDLES"]: rolePolicyKey("OWNER_HANDLES"),
  ["OIDC_ADMIN_GROUPS"]: rolePolicyKey("OIDC_ADMIN_GROUPS"),
  ["OIDC_ALLOWED_GROUPS"]: rolePolicyKey("OIDC_ALLOWED_GROUPS"),
  ["RE_DERIVE_ROLE_ON_LOGIN"]: rolePolicyKey("RE_DERIVE_ROLE_ON_LOGIN"),
  ["FORWARD_AUTH_VERIFY_JWT"]: RAW,
  ["FORWARD_AUTH_JWKS_ALLOWLIST"]: RAW,
  ["FORWARD_AUTH_JWT_ISSUER"]: RAW,
  ["FORWARD_AUTH_JWT_AUDIENCE"]: RAW,
  ["CREDENTIALS_KEY"]: deployOnly("boot-secret"),
  ["OIDC_ISSUER"]: oidcKey("OIDC_ISSUER"),
  ["OIDC_CLIENT_ID"]: oidcKey("OIDC_CLIENT_ID"),
  ["OIDC_CLIENT_SECRET"]: oidcKey("OIDC_CLIENT_SECRET"),
  ["OIDC_REDIRECT_URIS"]: oidcKey("OIDC_REDIRECT_URIS"),
  ["OIDC_PROVIDER_NAME"]: composed("the scripted issuer's display name", () => HARNESS_IDENTITY_PROVIDER),
  ["OIDC_SCOPES"]: oidcKey("OIDC_SCOPES"),
  ["OIDC_USERNAME_CLAIM"]: oidcKey("OIDC_USERNAME_CLAIM"),
  ["OIDC_UID_CLAIM"]: oidcKey("OIDC_UID_CLAIM"),
  ["OIDC_GROUPS_CLAIM"]: oidcKey("OIDC_GROUPS_CLAIM"),
  ["OIDC_EMAIL_CLAIM"]: oidcKey("OIDC_EMAIL_CLAIM"),
  ["OIDC_GROUPS_SEPARATOR"]: oidcKey("OIDC_GROUPS_SEPARATOR"),
  ["OIDC_SIGNUP"]: oidcKey("OIDC_SIGNUP"),
  ["OIDC_REQUIRE_APPROVAL"]: oidcKey("OIDC_REQUIRE_APPROVAL"),
  ["OIDC_BACKCHANNEL_LOGOUT"]: oidcKey("OIDC_BACKCHANNEL_LOGOUT"),
  ["SESSION_SECRET"]: deployOnly("boot-secret"),
  ["RATE_LIMIT_WINDOW_MS"]: RAW,
  ["RATE_LIMIT_AI_TURN"]: RAW,
  ["RATE_LIMIT_PUBLIC_IP"]: RAW,
  ["RATE_LIMIT_AUTHED"]: RAW,
  ["RATE_LIMIT_LOGIN"]: RAW,
  // The machine's facts are typed parse inputs, not env text, so each has a named option and no raw door.
  ["containerMarker"]: hostFact("containerMarker"),
  ["hostname"]: hostFact("hostname"),
} as const satisfies Record<EnvKey, EnvSeam> & { readonly [Fact in keyof HostFacts]: HostFactSeam<Fact> };

/** The keys `env` writes raw: a key a named option or the harness owns has one door, and a deploy-only key has none. */
type RawEnvKey = { readonly [Key in EnvKey]: (typeof ENV_SEAMS)[Key] extends RawSeam ? Key : never }[EnvKey];

/** The raw input a root's `env` option takes. */
export type RawEnvInput = Partial<Record<RawEnvKey, string>>;

function isRawKey(key: EnvKey): key is RawEnvKey {
  const row: EnvSeam = ENV_SEAMS[key];
  return row.kind === "seam" && row.option === "env";
}

function rawValue(key: EnvKey, options: EnvSeamOptions & { readonly env?: RawEnvInput }, root: RootFacts): string | undefined {
  if (isRawKey(key)) {
    return options.env?.[key];
  }
  const row = ENV_SEAMS[key];
  switch (row.kind) {
    case "seam":
      return row.raw(options);
    case "composed":
      return row.compose?.(root);
    case "deploy-only":
      return undefined;
  }
}

function doorOf(row: Exclude<EnvSeam, RawSeam>): string {
  switch (row.kind) {
    case "seam":
      return `set it through the \`${row.option}\` option`;
    case "composed":
      return `the harness composes it from ${row.derivation}`;
    case "deploy-only":
      return DEPLOY_ONLY_REASONS[row.reason];
  }
}

// An untyped caller, such as a script a case evaluates, can hand `env` any key; a key with another door is refused,
// because dropping it would compose a root that silently lacks the knob.
function refuseNonRawKeys(env: RawEnvInput | undefined): void {
  for (const key of ENV_KEYS) {
    if (env !== undefined && Object.hasOwn(env, key) && !isRawKey(key)) {
      throw new Error(`server harness: ${key} has no raw env door: ${doorOf(ENV_SEAMS[key])}`);
    }
  }
}

// The machine facts a root's options state; an unstated one keeps the test machine's.
function statedHostFacts({ containerMarker, hostname }: EnvSeamOptions): Partial<HostFacts> {
  return { ...(containerMarker === undefined ? {} : { containerMarker }), ...(hostname === undefined ? {} : { hostname }) };
}

/** A root's record: each key and machine fact read through its table row, then the production parse over the test
 *  posture.
 *  @throws Error when `env` names a key whose row is not raw. */
export function harnessEnv(options: EnvSeamOptions & { readonly env?: RawEnvInput }, root: RootFacts): Env {
  refuseNonRawKeys(options.env);
  return createTestEnv(
    Object.fromEntries(
      ENV_KEYS.flatMap((key) => {
        const value = rawValue(key, options, root);
        return value === undefined ? [] : [[key, value] as const];
      }),
    ),
    statedHostFacts(options),
  );
}
