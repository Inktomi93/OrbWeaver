// The positional route argument's SECTION check. `pnpm snap /<x>` drives a real browser navigation to
// `<base>/<x>`; the client's router (`routes/router.tsx` `/$section`) resolves `<x>` through
// `resolveSectionPath` and renders its not-found boundary for anything that fails — which the app then
// reports through `data-app-ready`/an empty query cache exactly like a boot failure (issue: `pnpm snap
// /settings` reads as BOOT-DEAD). Refusing HERE, before the browser ever launches, turns that
// misdiagnosis into a misuse error naming the real vocabulary.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args } from "../contract/types.ts";
import { knownRouteSections } from "../lib/section-ids.ts";

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

export function validateRouteSection(args: Args): string[] {
  const segment = routeSegment(args.route);
  if (segment === null) {
    return [];
  }
  const known = knownRouteSections();
  if (known.includes(segment)) {
    return [];
  }
  return [
    `route "${args.route}" names the unknown section "${segment}" — the app renders its not-found page there, ` +
      "not the section, so a snap of it reports the not-found render rather than the surface you asked for. " +
      `Valid sections: ${known.join(", ")}. To reach a Configuration group, drive client state instead of a URL: ` +
      "--goto config:<group> — pnpm snap --map --atlas lists the live groups.",
  ];
}
