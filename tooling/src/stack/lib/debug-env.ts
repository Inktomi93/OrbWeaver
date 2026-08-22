// `--debug` as a spawn-time env OVERLAY — the `.env` file is never written.
//
// THE PRECEDENCE FACT THIS EXISTS FOR: `foundation/env` loads `.env` with **override:true** — a key in the
// file BEATS the process env we spawn with (deliberate; the dev stack pins model/port/posture there and a
// stale shell export must not win). So an overlay for a key the file already declares is a SILENT NO-OP.
import type { DebugArming, DebugConflict, DebugEnvKey } from "../contract/types.ts";
import { DEBUG_ENV_KEYS } from "../contract/types.ts";

/** The value each non-token debug knob is armed to. `DEBUG_TOKEN` carries a minted secret instead. The
 *  keys are ENV NAMES (SCREAMING_SNAKE by the platform's convention, not ours), so the record is built
 *  from pairs rather than an object literal. */
const DEBUG_ON_VALUES: Readonly<Record<Exclude<DebugEnvKey, "DEBUG_TOKEN">, string>> = Object.fromEntries([
  ["WIRE_CAPTURE", "on"],
  ["RPG_TRACE", "on"],
]) as Readonly<Record<Exclude<DebugEnvKey, "DEBUG_TOKEN">, string>>;

/** The `wanted` placeholder for a DEBUG_TOKEN conflict. A conflict message names the file value and the
 *  wanted value; for the token the wanted value is a SECRET, so it is described, never printed
 *  ([[credential-display-response-echo-leak]]). */
const TOKEN_WANTED = "<a minted token — never printed>";

/** Decide what `--debug` actually arms, given what the repo `.env` already declares. Three arms, no
 *  silence:
 *    • file declares the SAME armed value  → adopt it, note the arming SOURCE (`.env`, not the overlay).
 *    • file declares a DIFFERENT value     → REFUSE with the exact fix. `--debug` must never be a placebo.
 *    • file is silent                      → the overlay arms it, and nothing is written to `.env`. */
export function resolveDebugArming(opts: { readonly fileEnv: Readonly<Record<string, string | undefined>>; readonly token: string }): DebugArming {
  const conflicts: DebugConflict[] = [];
  const notes: string[] = [];
  const overlay: Record<string, string> = {};
  let token = opts.token;

  const fileToken = opts.fileEnv["DEBUG_TOKEN"];
  if (fileToken === undefined) {
    overlay["DEBUG_TOKEN"] = token;
  } else if (fileToken.length > 0) {
    // A token in the file wins by precedence, so ADOPT it as the effective token rather than arming a
    // second one the server would ignore. Never echoed — only its source is reported.
    token = fileToken;
    notes.push("DEBUG_TOKEN: already declared in .env — using that token (the file wins over any overlay).");
  } else {
    // A bare `DEBUG_TOKEN=` line parses to the EMPTY STRING, not to absence — and `loadEnvFileWithOverride`
    // overrides on `value !== undefined`, so that empty value beats our overlay and the schema's
    // `.min(1).optional()` then leaves the surface OFF. Treating empty as absence is precisely the silent
    // placebo this refusal exists to prevent, so an empty file value is a CONFLICT like any other.
    conflicts.push({ key: "DEBUG_TOKEN", fileValue: "", wanted: TOKEN_WANTED });
  }

  for (const [key, wanted] of Object.entries(DEBUG_ON_VALUES)) {
    const fileValue = opts.fileEnv[key];
    if (fileValue === undefined) {
      overlay[key] = wanted;
    } else if (fileValue === wanted) {
      notes.push(`${key}: already ${wanted} in .env — armed by the file, not by --debug.`);
    } else {
      conflicts.push({ key: key as DebugEnvKey, fileValue, wanted });
    }
  }
  return conflicts.length > 0 ? { kind: "refused", conflicts } : { kind: "armed", overlay, token, notes };
}

/** The operator-facing refusal text for a `.env` conflict. Names the file values, never the token. */
export function debugConflictMessage(conflicts: readonly DebugConflict[]): string {
  const lines = conflicts.map((c) => `  .env declares ${c.key}=${c.fileValue}, but --debug needs ${c.key}=${c.wanted}`);
  return [
    "--debug REFUSED: the repo .env already pins a debug knob to a different value.",
    ...lines,
    "",
    "foundation/env loads .env with override:true, so the file WINS over the spawn env — arming it here",
    "would be a silent no-op. Delete the conflicting line(s) from .env; --debug then arms them per-launch",
    "with no file edit at all (which is the whole point of the flag).",
  ].join("\n");
}

/** Strip every debug key from an inherited env. Used when `--debug` is ABSENT: a stray
 *  `export WIRE_CAPTURE=on` in the operator's shell must not silently arm a production launch. `.env` is
 *  untouched by this — a knob declared in the file is deploy config and still applies. */
export function stripDebugEnv(base: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && !(DEBUG_ENV_KEYS as readonly string[]).includes(key)) {
      out[key] = value;
    }
  }
  return out;
}
