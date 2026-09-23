// The client router's first-segment vocabulary, read as TEXT from the client's own source (the rail
// sections and the router's static routes): tooling may not import the client package, the same reason
// `_shared/argv.ts`'s `--goto` grammar reads `SECTION_IDS` this way.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const SECTION_IDS_PATH = "packages/client/src/state/section-ids.ts";
const ROUTER_PATH = "packages/client/src/routes/router.tsx";

function clientSource(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
}

function quotedIdsIn(body: string): readonly string[] {
  return [...body.matchAll(/"(?<id>[^"]+)"/gu)].map((m) => m.groups?.["id"] ?? "");
}

function healKeysIn(body: string): readonly string[] {
  return [...body.matchAll(/^\s*(?<key>[A-Za-z0-9_$]+):/gmu)].map((m) => m.groups?.["key"] ?? "");
}

/** Every URL segment `resolveSectionPath` accepts: the live `SECTION_IDS` plus the retired ids that heal
 *  onto a live one (`RETIRED_SECTION_HEAL`) — a retired id is a real deep link, not an unknown route. */
export function knownRouteSections(): readonly string[] {
  const source = clientSource(SECTION_IDS_PATH);
  const tuple = /export const SECTION_IDS = \[(?<body>[^\]]*)\]/u.exec(source)?.groups?.["body"];
  if (tuple === undefined) {
    throw new Error(`${SECTION_IDS_PATH}: SECTION_IDS tuple not found — the reader rotted`);
  }
  const heal = /export const RETIRED_SECTION_HEAL: Readonly<Record<string, SectionId>> = \{(?<body>[^}]*)\}/u.exec(source)?.groups?.["body"] ?? "";
  return [...quotedIdsIn(tuple), ...healKeysIn(heal)];
}

/** The router's STATIC top-level routes other than `/` (today `/login`). TanStack ranks a static path above
 *  the `/$section` alias, so these resolve on their own and never reach `resolveSectionPath`. The alias
 *  literal is the reader's anchor: a router without it is a shape this reader no longer understands. */
export function staticRouteSegments(): readonly string[] {
  const source = clientSource(ROUTER_PATH);
  if (!source.includes('path: "/$section"')) {
    throw new Error(`${ROUTER_PATH}: the "/$section" alias route not found — the reader rotted`);
  }
  return [...source.matchAll(/\bpath: "\/(?<segment>[^"$/]+)"/gu)].map((m) => m.groups?.["segment"] ?? "");
}
