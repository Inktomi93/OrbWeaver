// The session flag family, spread into ops/flags-handlers.ts's
// one dispatch table the way ops/flags-stage.ts is: one ops/ file per command family. `--session <name>`
// drives (boots on first use); the four admin modes print and exit (mutually exclusive — enforced in
// ops/parse.ts); `--session-ttl` is a boot property; `--session-daemon <name>` is the DAEMON'S OWN entry,
// spawned by the client through _shared/proc.ts and never typed by an operator (the help says so).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

// No session flag is page-targeted (`@N` is a per-tab concern and a session is one browser), so none
// takes the page index — the same narrowing ops/flags-stage.ts makes.
type SessionFlagHandler = (args: Args, rest: string[]) => void;

/** `--session-status [<name>]`: the name is optional and a NAME, never a selector — so it consumes the
 *  next token only when that token is not a flag. ops/parse.ts's scanner mirrors this exact rule through
 *  OPTIONAL_NAME_FLAGS (ops/flags-classes.ts); the two must agree or the scanner counts the name as a route. */
function consumeOptionalName(rest: string[]): string | null {
  const next = rest[0];
  if (next !== undefined && !next.startsWith("-")) {
    return rest.shift() ?? null;
  }
  return null;
}

export const SESSION_FLAG_HANDLERS: Record<string, SessionFlagHandler> = {
  "--session": (a, rest) => {
    a.session = rest.shift() ?? null;
  },
  "--session-daemon": (a, rest) => {
    a.sessionDaemon = rest.shift() ?? null;
  },
  "--session-status": (a, rest) => {
    a.sessionStatus = true;
    a.sessionStatusName = consumeOptionalName(rest);
  },
  "--session-close": (a, rest) => {
    a.sessionClose = rest.shift() ?? null;
  },
  "--session-sweep": (a) => {
    a.sessionSweep = true;
  },
  "--session-export": (a, rest) => {
    a.sessionExport = rest.shift() ?? null;
  },
  // A bad value keeps null here and is REFUSED by ops/parse.ts (a positive number of minutes), so a session
  // never silently boots with the default TTL its argv did not ask for.
  "--session-ttl": (a, rest) => {
    const value = Number(rest.shift() ?? "");
    a.sessionTtlMin = Number.isFinite(value) && value > 0 ? value : null;
  },
};
