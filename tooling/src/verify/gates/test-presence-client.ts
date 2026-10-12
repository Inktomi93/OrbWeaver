// Policy: test-presence-client (docs/law/Spine-Testing.md §5) — the one named-file floor in the client: the standing
// worst-legal-art contrast CT must exist. Client `data/`, `forms/` and `state/` modules, non-primitive `@orb/ui` logic
// modules and store actions are demanded by `test-reach`, by reach and never by a mirrored file name.
// The floor stays a file because deleting that CT restores a known blind class across every theme polarity at once.
//
// FAMILY `mirror-index` — read through the `mirrorIndex` host door (`ops/resource-mirror.ts` `loadMirrorIndex`), whose
// refusal on an absent or empty test tree keeps a missing tree from reading as a missing CT.
//
// THE ANCHOR. The CT is an absence verdict, and a file that does not exist is in no population, so the finding cannot
// anchor on it (`ctx.report.file` refuses a path outside the effective population). It consumes
// `lib/absent-subject-anchor.ts` `subjectAnchor`: the CT when present, else the first present named subject (the room
// source, then the client entry), else the lowest admitted path, with the missing filename in the MESSAGE.
//
// AUTHORITY `hard`; SEVERITY `error`. Every finding is FILE-anchored with no position token, so no ordinary
// suppression door exists by construction. A subset run leaves the whole-tree absence to the whole run.

import { defineGate } from "../contract/policy.ts";
import type { MirrorIndex } from "../contract/resource-mirror.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CLIENT_ENTRY_ANCHOR = "packages/client/src/index.ts";
const WORST_ART_ANCHOR = "packages/client/src/features/chat/surfaces/chat-room-surface.tsx";
// The standing CT is a legacy file until its rebuilt suite lands; the floor holds it wherever it lives.
const WORST_ART_STANDING_CT = "tests/legacy/client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx";

/** The missing filename rides the MESSAGE because the finding cannot anchor on an absent subject. */
const MSG_WORST_ART = `the standing DOM-derived worst-legal-art contrast CT is missing — restore ${WORST_ART_STANDING_CT}. The room's rendered text population must stay sampled across shipped and custom theme polarities.`;

/** The standing CT is a whole-tree absence, so a subset run leaves it to the whole run. */
function worstArtMissing(mirror: MirrorIndex, subset: boolean): boolean {
  const armed = !subset && (mirror.sourceFiles.has(WORST_ART_ANCHOR) || mirror.sourceFiles.has(CLIENT_ENTRY_ANCHOR));
  return armed && !mirror.testFiles.has(WORST_ART_STANDING_CT);
}

export const gate = defineGate({
  id: "test-presence-client",
  family: "mirror-index",
  authority: "hard",
  severity: "error",
  population: { in: ["@client"], notNamed: ["index.ts"] },
  analysis: "resource",
  execution: "selected-files",
  facts: [],
  resources: [{ kind: "mirror-index", id: "package-test" }],
  message: MSG_WORST_ART,
  fix: `restore ${WORST_ART_STANDING_CT}.`,
  create: (ctx) => ({
    evaluate: () => {
      const mirror = readyResourceValue(ctx.resources.mirrorIndex("package-test"));
      if (worstArtMissing(mirror, ctx.subset)) {
        const anchor = subjectAnchor(new Set(ctx.resourcePaths), [WORST_ART_STANDING_CT, WORST_ART_ANCHOR, CLIENT_ENTRY_ANCHOR]);
        ctx.report.file(anchor(WORST_ART_STANDING_CT), { line: 1, column: 1, message: MSG_WORST_ART });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        [WORST_ART_ANCHOR]: "export function ChatRoomSurface(): null {\n  return null;\n}\n",
        "tests/client/features/chat/surfaces/chat-room-surface.ct.tsx": "export {};\n",
      },
      expect: { count: 1 },
      why: "the real room exists but its standing framebuffer contrast sweep is missing — presence must fail loud. THE ANCHOR MOVE: the finding reports at the ROOM (present, in population), never at the absent CT",
    },
    {
      mode: "resource",
      files: {
        [CLIENT_ENTRY_ANCHOR]: "export {};\n",
        "packages/client/src/data/parse.ts": "export function parse(): boolean {\n  return true;\n}\n",
        "tests/client/data/parse.test.ts": "export {};\n",
      },
      expect: { count: 1 },
      why: "stale arm: the independent client-entry anchor survives while the room source and the standing CT are both absent — a coupled rename/delete must still fail loud, and with the room gone the anchor falls through to the SECOND named subject",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        [WORST_ART_ANCHOR]: "export function ChatRoomSurface(): null {\n  return null;\n}\n",
        [WORST_ART_STANDING_CT]: "export {};\n",
      },
      why: "the standing worst-art CT exists beside the real room — presence satisfied",
    },
  ],
});
