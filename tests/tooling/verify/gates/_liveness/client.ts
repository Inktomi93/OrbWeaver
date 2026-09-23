// Real-corpus liveness arms (#2149) for policies judging the frontend packages (`@client`, `@ui`). DATA,
// collected by the one runner (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the
// structure run's own corpus once and runs every arm against it (docs/work/0043).
import { gate as doors } from "../../../../../tooling/src/verify/gates/duplicate-action-doors.ts";
import { gate as doorsHealth } from "../../../../../tooling/src/verify/gates/duplicate-action-doors-health.ts";
import { gate as flip } from "../../../../../tooling/src/verify/gates/no-unruled-flip-inversion.ts";
import { gate as windowedHealth } from "../../../../../tooling/src/verify/gates/windowed-infinite-query-health.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

/** A neutralise overlay that simply removes the watched subject from a file. */
function blank(path: string): RealCorpusOverlay {
  return { kind: "neutralise", path, source: "export const neutralised = 1;\n" };
}

/** The ruled FLIP site's own shape, reduced to the three lines that make it a FLIP: write, flush, clear. */
const GLIDE_SOURCE =
  "export function glide(node: HTMLElement, dx: number): void {\n" +
  "  node.style.transform = `translateX(${String(dx)}px)`;\n" +
  "  node.getBoundingClientRect();\n" +
  '  node.style.transform = "";\n' +
  "}\n";

export const CLIENT_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: windowedHealth,
    // "No `infiniteQueryOptions` call site exists under packages/client/src" — there are SIX, so the control
    // is all six. Neutralising one would leave five and prove the opposite of what the arm claims.
    overlays: [
      blank("packages/client/src/features/databank/surfaces/databank-library-surface.tsx"),
      blank("packages/client/src/features/chat/hooks/use-chat-list-collection.ts"),
      blank("packages/client/src/features/discovery/components/corpus-browse-view.tsx"),
      blank("packages/client/src/features/character/surfaces/character-library-surface.tsx"),
      blank("packages/client/src/components/character-picker.tsx"),
      blank("packages/client/src/data/create-collection-surface.ts"),
    ],
    messageIncludes: "DERIVED NOTHING",
  },
  {
    policy: flip,
    // A THIRD FLIP site in the real client tree. §1.5 admits two sites as the whole exception class and the
    // grant table licenses exactly the one that writes a transform, so a third is an effective finding.
    overlays: [{ kind: "add", path: "packages/client/src/features/chat/components/flip-live-probe.tsx", source: GLIDE_SOURCE }],
    messageIncludes: "not a third member",
  },
  {
    policy: doors,
    // TWO overlays because one door is not a duplication: the pair must be minted whole. Both paths sort
    // BEFORE every real door of their own new procedure, so the aggregated finding anchors on `…-a.tsx` and
    // the arm's `add` scope can see it.
    overlays: [
      {
        kind: "add",
        path: "packages/client/src/features/chat/components/pcdd-live-probe-a.tsx",
        source: "export const A = () => trpc.chat.pcddLiveProbe.mutationOptions();\n",
      },
      {
        kind: "add",
        path: "packages/client/src/features/chat/components/pcdd-live-probe-b.tsx",
        source: "export const B = () => trpc.chat.pcddLiveProbe.mutationOptions();\n",
      },
    ],
    messageIncludes: "Subject: chats::chat.pcddLiveProbe",
  },
  {
    policy: doorsHealth,
    // A tripwire fires when its SUBJECT DISAPPEARS, so the control is the inverse: overwrite the vocabulary
    // home with a version that declares no `SECTION_IDS`.
    overlays: [{ kind: "neutralise", path: "packages/client/src/state/section-ids.ts", source: "export const SECTION_IDS_RENAMED = [] as const;\n" }],
    messageIncludes: "`SECTION_IDS` resolved to ZERO members",
  },
];
