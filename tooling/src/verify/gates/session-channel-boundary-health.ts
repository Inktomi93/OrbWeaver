// Policy: session-channel-boundary-health — the BLINDNESS TRIPWIRE (§4.6) for `session-channel-boundary`:
// the sanctioned home (`packages/client/src/lib/session-channel.ts`) loaded and constructing NO
// BroadcastChannel means the fence names a home that moved, or a home whose construction left, and the
// occurrence policy would report ✓ forever. Split from the legacy descriptor (guide §12.6, #1950) because
// this is a whole-tree HARD verdict — no author may waive "the fence is blind" — while the occurrence arm is
// a per-file ordinary one; one `execution` and one authority cannot serve both.
//
// FAMILY `session-channel` — the shared reader is `lib/broadcast-channel-origin.ts`
// (`classifyBroadcastChannelConstruction`), the SAME predicate the occurrence policy judges with, so what
// counts as "the home constructs" here is exactly what counts as "a construction" there.
//
// POPULATION PORT: byte-identical (`@client`, the legacy `scanRoot`). `entire-population` because whether
// ONE file constructs is a question no per-file subset can answer; a narrowed request DEFERS this policy
// (pinned in tests/tooling/verify/gates/session-channel-family.test.ts) instead of declaring the home dead.
//
// THE ANCHOR MOVE (§4.6 classified difference, the same one tier-home-health-family.int.test.ts records for
// the spacing family): the legacy tripwire reported on line 1 of the GATE MODULE ITSELF, which is outside
// `@client` and therefore a path `ctx.report.file` cannot express. The finding now anchors on the real-tree
// anchor (`packages/client/src/lib/index.ts`) the legacy arm already self-guarded on. The SELF-GUARD is
// carried verbatim: with the anchor absent — a fixture, a mini-project, a foreign family test — the tripwire
// stays silent rather than "proving" the home dead (mustPass[1]).
//
// Legacy descriptor: `774231540` (`tooling/src/verify/gates/session-channel-boundary.ts`, arm B).
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyBroadcastChannelConstruction, SESSION_CHANNEL_ANCHOR, SESSION_CHANNEL_HOME } from "../lib/broadcast-channel-origin.ts";

const MESSAGE =
  `session-channel-boundary is BLIND: its home "${SESSION_CHANNEL_HOME}" constructs no BroadcastChannel. Either the channel ` +
  "moved (re-point SESSION_CHANNEL_HOME in lib/broadcast-channel-origin.ts) or it was deleted (delete both session-channel " +
  "policies) — as written the fence would report clean forever. See docs/history/design/staleness-and-session-freshness.md §4.3.";

export const gate = defineGate({
  id: "session-channel-boundary-health",
  family: "session-channel",
  authority: "hard",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "Re-point SESSION_CHANNEL_HOME at the file that now constructs the channel, or delete both session-channel policies with the channel.",
  create: (ctx) => {
    let homeConstructs = false;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.NewExpression],
          visit: (node, sourceFile) => {
            if (!Node.isNewExpression(node) || ctx.relativePath(sourceFile) !== SESSION_CHANNEL_HOME) {
              return;
            }
            if (classifyBroadcastChannelConstruction(node) === "constructs") {
              homeConstructs = true;
            }
          },
        },
      ],
      evaluate: () => {
        // The tripwire is a whole-tree claim about ONE file: without the real-tree anchor a fixture or a
        // mini-project would "prove" the home dead — the §4.5 misfire the legacy arm guarded against too.
        if (homeConstructs || !ctx.files.some((sourceFile) => ctx.relativePath(sourceFile) === SESSION_CHANNEL_ANCHOR)) {
          return;
        }
        ctx.report.file(SESSION_CHANNEL_ANCHOR, { line: 1, column: 1 });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [SESSION_CHANNEL_ANCHOR]: "export const lib = {};\n",
        [SESSION_CHANNEL_HOME]: "export function postSessionMessage(): void {}\n",
      },
      expect: { count: 1, line: 1, messageIncludes: "is BLIND" },
      why: "ARM B as carried: the home is loaded but no longer constructs a channel (its construction moved out), so the fence would be a permanent false green",
    },
    {
      mode: "types",
      files: {
        [SESSION_CHANNEL_ANCHOR]: "export const lib = {};\n",
        "packages/client/src/lib/other.ts": 'export const c = new BroadcastChannel("orb:session");\n',
      },
      expect: { count: 1, line: 1, messageIncludes: "is BLIND" },
      why: "THE MOVED HOME: the anchor is loaded, the channel is constructed in ANOTHER file and the home path resolves to nothing — the rename the message names, reported at the anchor because the dead path cannot carry a finding",
    },
    {
      mode: "types",
      files: {
        [SESSION_CHANNEL_ANCHOR]: "export const lib = {};\n",
        [SESSION_CHANNEL_HOME]: "const BroadcastChannel = Map;\nexport const c = new BroadcastChannel<string, number>();\n",
      },
      expect: { count: 1, line: 1, messageIncludes: "is BLIND" },
      why: "THE IDENTITY HALF of the tripwire: the home constructs a const NAMED BroadcastChannel that aliases ANOTHER global, which is not the channel — the shared reader resolves the alias to `Map`. Replacing the global-name comparison with a bare `constructs` reds this row",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [SESSION_CHANNEL_ANCHOR]: "export const lib = {};\n",
        [SESSION_CHANNEL_HOME]: 'export const c = new BroadcastChannel("orb:session");\n',
      },
      why: "the sanctioned home constructing the one channel, judged against the real-tree anchor — the tripwire stays quiet",
    },
    {
      mode: "types",
      files: { [SESSION_CHANNEL_HOME]: "export function postSessionMessage(): void {}\n" },
      why: "THE ANCHOR GUARD: with no real-tree anchor in the project the tripwire self-guards off — a synthetic mini-project can never red it. Deleting the anchor check reds this row",
    },
  ],
});
