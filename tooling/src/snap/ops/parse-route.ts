// The positional route's SECTION check: an unknown `/<x>` renders the app's not-found page, which reads like
// a boot failure, so it refuses before the browser launches. It judges only an orb app target: a `--base`
// fixture server serves files, not sections, and refusing those is the instrument lying the other way.
import { DEFAULT_BASE } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { ORB_APP_PORT_NUMBERS } from "../../_shared/ports.ts";
import type { Args } from "../contract/types.ts";
import { knownRouteSections, staticRouteSegments } from "../lib/section-ids.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** `/<segment>` (and nothing past the first `/` or `?`) is the one shape `resolveSectionPath` reads;
 *  the bare root `/` and a non-route target (`--file`, a raw URL passed as `--base`) carry no segment. */
function routeSegment(route: string): string | null {
  if (!route.startsWith("/") || route === "/") {
    return null;
  }
  const segment = route.slice(1).split(/[/?]/u)[0] ?? "";
  return segment === "" ? null : segment;
}

// A private stack on an unregistered port is not judged here; `ops/drive.ts` still names its NOT-FOUND render.
function targetsOrbApp(args: Args): boolean {
  if (args.isolated || args.base === DEFAULT_BASE) {
    return true;
  }
  const url = URL.parse(args.base);
  return url !== null && ORB_APP_PORT_NUMBERS.has(Number(url.port));
}

/** The check on args whose `base` is the real target. */
export function validateRouteSection(args: Args): string[] {
  const segment = routeSegment(args.route);
  if (segment === null || !targetsOrbApp(args)) {
    return [];
  }
  const sections = knownRouteSections();
  const statics = staticRouteSegments();
  if (sections.includes(segment) || statics.includes(segment)) {
    return [];
  }
  return [
    `route "${args.route}" names the unknown section "${segment}" — the app renders its not-found page there, ` +
      "not the section, so a snap of it reports the not-found render rather than the surface you asked for. " +
      `Valid sections: ${sections.join(", ")}; other routes: ${statics.join(", ")}. To reach a Configuration group, drive client state instead of a URL: ` +
      "--goto config:<group> — pnpm snap --map --atlas lists the live groups.",
  ];
}

/** The parse-time door. Where the argv does not name the target, the caller that knows it judges instead:
 *  a `--session` call reaches its session's binding (`ops/session-client.ts`), and a scenario checkpoint or
 *  a daemon re-parse inherits the outer run's base (`ops/scenario-prepare.ts`, the session client). */
export function validateParsedRouteSection(args: Args, targetInherited: boolean): string[] {
  return targetInherited || args.session !== null ? [] : validateRouteSection(args);
}
