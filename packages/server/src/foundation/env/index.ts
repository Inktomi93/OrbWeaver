// The one `process.env` reader: the `.env` load, this process's frozen `env` (the record's `parseEnv` over the loaded
// environment), the secret scrub, and the raw snapshot the agent-sdk credential firewall spreads. Only the composition
// root imports this module by value; every other tier takes the parsed record from `./record/index.ts`.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { parseEnv as parseDotenv } from "node:util";
import type { AuthModeSource } from "@orb/contracts/identity";
import { ENV_FROM_FILE_KEY, envFromFileKeys } from "@orb/kit/env-file";
import { isSupervised } from "@orb/kit/supervisor";
import type { Env } from "./record/index.ts";
import { APP_SECRET_ENV_KEYS, parseEnv } from "./record/index.ts";

export type {
  AllowedHostsInput,
  BindPosture,
  BindPostureInput,
  DiagnosticsExposure,
  DiagnosticsPosture,
  DiagnosticsPostureInput,
  Env,
  EnvKey,
  OwnerFallbackCredentialInput,
  OwnerFallbackPeerInput,
  OwnerFallbackPeerPosture,
} from "./record/index.ts";
export {
  allowedHostsInput,
  bindPostureInput,
  bindPostureWarnings,
  DIAGNOSTICS_EXPOSURES,
  diagnosticsPostureInput,
  diagnosticsPostureWarnings,
  ENV_KEYS,
  fileReadCommand,
  installKind,
  loopbackCompanion,
  loopbackOrigin,
  ownerFallbackCredentialInput,
  ownerFallbackPeerInput,
  ownerFallbackPeerWarnings,
  parseEnv,
  parseOwnerFallbackTrustedPeers,
  parseTrustedPrivateRanges,
  personaAutoSeedAdmits,
  publicAddresses,
  resolveAllowedHosts,
  resolveBindPosture,
  resolveDiagnosticsPosture,
  resolveOwnerFallbackCredential,
  resolveOwnerFallbackPeers,
  settingInstruction,
} from "./record/index.ts";

// The `.env` file the loader below reads, cwd-relative — exactly the path dotenv resolved
// (`path.resolve(process.cwd(), ".env")`), so a prod launch (`pnpm stack up prod` / `up-fg prod`, both
// cwd = repo root via buildProdSpawnPlan) keeps finding it.
const ENV_FILE = ".env";
// A leading UTF-8 byte-order mark. parseEnv does NOT strip it (dotenv did) — see loadEnvFileWithOverride.
const UTF8_BOM = "﻿";

/** Load a local `.env` into `process.env`. `override` = a checked-in dev `.env` WINS over an already-set
 *  (stale shell) export; otherwise the file only fills keys that are unset.
 *
 *  dotenv died here 2026-08-03 (node-26 adoption program §3) — `node:util`'s `parseEnv` IS the platform
 *  .env parser. `process.loadEnvFile()` is deliberately NOT used: it can only ever fill UNSET keys, and
 *  the override direction is load-bearing (the dev stack pins model/port/posture in the checked-in
 *  `.env`; a silent flip to "a stale shell export wins" reads as a config bug for hours). The merge is
 *  therefore OURS and stays explicit here.
 *
 *  Parity with dotenv 16.6.1 was MEASURED case-by-case (30 inputs, 2026-08-03), not assumed: identical on
 *  comments, blank + junk lines, `export ` prefixes, single/double/backtick quotes, `\n` escapes inside
 *  double quotes, literal multiline quoted values, inline `#` comments, CRLF, duplicate keys, unterminated
 *  quotes and the empty file. Exactly two deltas:
 *    1. a UTF-8 BOM — dotenv stripped it, `parseEnv` keeps it IN THE KEY, silently renaming the first key
 *       to `﻿KEY`. That is precisely the silent-misconfiguration class this loader must not ship, so
 *       the BOM is stripped below.
 *    2. dotenv also accepted a non-standard `KEY: value` separator; `parseEnv` ignores such a line. No
 *       `.env` in this repo or on this box uses it, and re-implementing a vendor dialect would defeat
 *       adopting the platform parser. Accepted, and pinned by test so the delta stays deliberate.
 *
 *  A missing or unreadable file is a silent no-op — the same tolerance dotenv's `quiet: true` gave. */
/** The keys the loaded `.env` FILE declared (populated by `loadEnvFileWithOverride`). Provenance the parsed
 *  `env` can't carry: because the file loads with `override:true`, a value in `.env` wins over a launcher's
 *  export, so #301 needs to know which knobs the FILE pinned regardless of what the schema finally resolved.
 *  Empty when the file is absent/unreadable or skipped (`ORB_ENV_NO_FILE`, e.g. under vitest).
 *
 *  ASSUMES(single-replica) — and it holds BY CONSTRUCTION, so no DB-backed seam is warranted (unlike a
 *  per-request process cache, the shape this gate exists to catch). This Set is written EXACTLY ONCE, at
 *  module load, by the single `loadEnvFileWithOverride(...)` call at the bottom of this file; nothing mutates
 *  it per request, and its only reader is the #301 refusal in the parse below. Every replica loads the SAME
 *  `.env` with `override:true` and computes byte-identical contents, so there is no cross-replica state to
 *  reconcile — it is boot-constant deployment provenance, not runtime accumulator state. */
const envFileKeys = new Set<string>();
// The keys whose value the file actually put in `process.env`: a declared key the process already held stays the
// process's under no-override, so declaring is not supplying. Written once at load, like `envFileKeys`.
const envFileSuppliedKeys = new Set<string>();
// The value the file declared per key, so a launcher's restated key counts as the file's only while it still holds it.
const envFileValues = new Map<string, string>();

function loadEnvFileWithOverride(override: boolean): void {
  // ORB_ENV_NO_FILE — skip the file ENTIRELY (not merely the override direction). Set globally by
  // vitest.config.ts: filling unset keys from a real `.env` makes a test assert against the operator's
  // deploy config rather than the schema default, which produced reds that were not regressions (see that
  // file's note). Distinct from ORB_ENV_NO_OVERRIDE below, which keeps the load and only flips precedence.
  if (process.env["ORB_ENV_NO_FILE"] !== undefined) {
    return;
  }
  let raw: string;
  // a missing .env is a normal deploy state —
  // envFileKeys stays empty, correctly read by the #301 superRefine as "not declared". Ends
  // if the loader stops treating a missing file as absence rather than an error.
  try {
    raw = readFileSync(resolve(process.cwd(), ENV_FILE), "utf8");
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parseDotenv(raw.startsWith(UTF8_BOM) ? raw.slice(UTF8_BOM.length) : raw))) {
    if (value !== undefined) {
      envFileKeys.add(key);
      envFileValues.set(key, value);
      if (override || process.env[key] === undefined) {
        process.env[key] = value;
        envFileSuppliedKeys.add(key);
      }
    }
  }
}

// Load a local .env before parsing. override:true so a checked-in dev .env wins over a stale shell
// export. Two escape hatches (VITEST, ORB_ENV_NO_OVERRIDE=1) keep the override from fighting a one-off
// invocation that wants its own shell vars honored.
const skipOverride = process.env["VITEST"] !== undefined || process.env["ORB_ENV_NO_OVERRIDE"] !== undefined;
loadEnvFileWithOverride(!skipOverride);

// A value present right after the load and not put there by the file came with the process, unless the launcher says
// it restated that key from the file (`pnpm start --share` / `--port` re-send `.env` with the override off). The value
// must still equal the file's, so a hand-set list cannot claim a value `.env` does not hold.
function sourceAfterLoad(key: string): AuthModeSource {
  if (envFileSuppliedKeys.has(key) || (envFromFileKeys(process.env[ENV_FROM_FILE_KEY]).has(key) && envFileValues.get(key) === process.env[key])) {
    return "env-file";
  }
  return process.env[key] === undefined ? "default" : "process-env";
}

// Read once, before anything can scrub or rewrite `process.env`.
const AUTH_MODE_SOURCE = sourceAfterLoad("AUTH_MODE");

/** This process's parsed env, read once at load. Only the composition root reads it (`createProcessSeams` hands it to
 *  every root; `entry/lifecycle.ts` reads it at boot); every other site takes the record as a dependency. */
export const env: Env = parseEnv(process.env, envFileKeys);

/** Deletes every {@link APP_SECRET_ENV_KEYS} entry from `process.env`, so no child process started afterwards inherits
 *  an app secret. The server entry calls it once, right after the parse. It cannot run at module load: the dev
 *  launcher imports this module to preflight the env and then hands its own `process.env` to the server it spawns. */
export function scrubAppSecretsFromProcessEnv(): void {
  for (const key of APP_SECRET_ENV_KEYS) {
    Reflect.deleteProperty(process.env, key);
  }
}

/** The raw `process.env` snapshot — the baseline the agent-sdk child env builders spread. */
function processEnvSnapshot(): Record<string, string | undefined> {
  return { ...process.env };
}

/** The agent child-env baseline excludes absent variables; each call reads the current process snapshot. */
export function hostEnvAllowlist(): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(processEnvSnapshot()).flatMap(([key, value]) => (value === undefined ? [] : [[key, value] as const])));
}

/** Where this process's `AUTH_MODE` came from, fixed at load. Only the source travels; the value is the record's. */
export function authModeSource(): AuthModeSource {
  return AUTH_MODE_SOURCE;
}

/** Was this process started by the launcher that respawns it on the restart exit code (`@orb/kit/supervisor`)? The
 *  key is launch-only (`LAUNCH_ONLY_ENV_KEYS`), so `.env` cannot claim a supervisor that is not there. */
export function launchedBySupervisor(): boolean {
  return isSupervised(process.env);
}
