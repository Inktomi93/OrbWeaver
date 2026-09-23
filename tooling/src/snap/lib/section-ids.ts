// The rail SECTION vocabulary, read from the client's own source (packages/client/src/state/
// section-ids.ts) rather than copied — tooling may not import the client package (`AGENTS.md` package
// direction), so this is the same lens `_shared/argv.ts`'s `--goto` grammar and its pinning test
// (`tests/tooling/_shared/argv.test.ts`) already use: read the tuple's TEXT and extract the ids.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const SECTION_IDS_PATH = "packages/client/src/state/section-ids.ts";

function quotedIdsIn(body: string): readonly string[] {
  return [...body.matchAll(/"(?<id>[^"]+)"/gu)].map((m) => m.groups?.["id"] ?? "");
}

function healKeysIn(body: string): readonly string[] {
  return [...body.matchAll(/^\s*(?<key>[A-Za-z0-9_$]+):/gmu)].map((m) => m.groups?.["key"] ?? "");
}

/** Every URL segment `resolveSectionPath` accepts: the live `SECTION_IDS` plus the retired ids that heal
 *  onto a live one (`RETIRED_SECTION_HEAL`) — a retired id is a real deep link, not an unknown route. */
export function knownRouteSections(): readonly string[] {
  const source = readFileSync(fileURLToPath(new URL(`../../../../${SECTION_IDS_PATH}`, import.meta.url)), "utf8");
  const tuple = /export const SECTION_IDS = \[(?<body>[^\]]*)\]/u.exec(source)?.groups?.["body"];
  if (tuple === undefined) {
    throw new Error(`${SECTION_IDS_PATH}: SECTION_IDS tuple not found — the reader rotted`);
  }
  const heal = /export const RETIRED_SECTION_HEAL: Readonly<Record<string, SectionId>> = \{(?<body>[^}]*)\}/u.exec(source)?.groups?.["body"] ?? "";
  return [...quotedIdsIn(tuple), ...healKeysIn(heal)];
}
