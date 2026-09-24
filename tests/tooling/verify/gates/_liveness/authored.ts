// Real-corpus liveness arms (#2149) for the policies whose declared population is `@authored` with its own
// narrowing — the ones the `tooling-and-authored.ts` chunk (exact population) left behind (0042's sixth
// chunk). DATA, collected by the one runner (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which
// loads the structure run's own corpus once and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE. Several of these policies
// read authored TEXT (a marker comment, a suppression directive, a debt citation), and this file is authored
// text too: every such token is assembled from parts below, so the planted string exists only in the overlay
// and never in this file for the real structure run to find.
import { gate as chatStreamWritesInBusOnly } from "../../../../../tooling/src/verify/gates/chat-stream-writes-in-bus-only.ts";
import { gate as gateIgnoreInventory } from "../../../../../tooling/src/verify/gates/gate-ignore-inventory.ts";
import { gate as noAwaitDbInLoop } from "../../../../../tooling/src/verify/gates/no-await-db-in-loop.ts";
import { gate as noBlanketSuppression } from "../../../../../tooling/src/verify/gates/no-blanket-suppression.ts";
import { gate as noChatTrpcInSurface } from "../../../../../tooling/src/verify/gates/no-chat-trpc-in-surface.ts";
import { gate as noContextReturntype } from "../../../../../tooling/src/verify/gates/no-context-returntype.ts";
import { gate as noIfIsGroup } from "../../../../../tooling/src/verify/gates/no-if-is-group.ts";
import { gate as noInlineOptimisticInSurface } from "../../../../../tooling/src/verify/gates/no-inline-optimistic-in-surface.ts";
import { gate as noInlineUnionRedecl } from "../../../../../tooling/src/verify/gates/no-inline-union-redecl.ts";
import { gate as noStaticStaletime } from "../../../../../tooling/src/verify/gates/no-static-staletime.ts";
import { gate as noTestFabrication } from "../../../../../tooling/src/verify/gates/no-test-fabrication.ts";
import { gate as persistenceNoInMemoryState } from "../../../../../tooling/src/verify/gates/persistence-no-in-memory-state.ts";
import { gate as queryMachineSeals } from "../../../../../tooling/src/verify/gates/query-machine-seals.ts";
import { gate as testFixtureImports } from "../../../../../tooling/src/verify/gates/test-fixture-imports.ts";
import { gate as testMockDoctrine } from "../../../../../tooling/src/verify/gates/test-mock-doctrine.ts";
import { gate as zustandSelectorStability } from "../../../../../tooling/src/verify/gates/zustand-selector-stability.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

const CHAT = "packages/client/src/features/chat";
const CHARACTER_PERSISTENCE = "packages/server/src/domain/character/persistence";
// The text tokens, assembled so none appears whole in this file.
const RETIRED_MARKER = ["@orb-gate", "-ignore"].join("");
const BLANKET_SUPPRESSION = ["biome", "-ignore-all"].join("");

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

export const AUTHORED_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: chatStreamWritesInBusOnly,
    overlays: [
      add(`${CHAT}/components/liveness-turn.tsx`, 'import { chatStream } from "../../../state/chat-stream.ts";\nexport const livenessPush = chatStream;\n'),
    ],
    messageIncludes: "outside data/bus/",
  },
  {
    policy: gateIgnoreInventory,
    overlays: [add("packages/ui/src/liveness-marker.ts", `// ${RETIRED_MARKER} no-such-gate: retired marker\nexport const livenessMarked = 1;\n`)],
    messageIncludes: `a dead \`${RETIRED_MARKER}\` marker`,
  },
  {
    policy: noAwaitDbInLoop,
    overlays: [
      add(
        `${CHARACTER_PERSISTENCE}/liveness-loop.ts`,
        'import type { Db } from "@orb/db";\nimport { characters } from "@orb/db";\nimport { and, eq } from "drizzle-orm";\nexport async function livenessLoop(db: Db, ids: readonly string[], owner: string): Promise<void> {\n  for (const id of ids) {\n    await db.select().from(characters).where(and(eq(characters.id, id), eq(characters.ownerId, owner)));\n  }\n}\n',
      ),
    ],
    messageIncludes: "inside a loop",
  },
  {
    policy: noBlanketSuppression,
    overlays: [
      add(
        "packages/kit/src/liveness-blanket.ts",
        `// ${BLANKET_SUPPRESSION} lint/suspicious/noBitwiseOperators: liveness\nexport const a = 1 | 2;\nexport const b = 3;\n`,
      ),
    ],
    messageIncludes: BLANKET_SUPPRESSION,
  },
  {
    policy: noChatTrpcInSurface,
    overlays: [
      add(
        `${CHAT}/surfaces/liveness-verb-surface.tsx`,
        'import { useTRPC } from "#data";\nexport function LivenessVerbSurface(): unknown {\n  const trpc = useTRPC();\n  return trpc.chat.generate.mutationOptions();\n}\n',
      ),
    ],
    messageIncludes: "outside the sanctioned verb-hook home",
  },
  {
    policy: noContextReturntype,
    overlays: [
      add(
        "packages/server/src/domain/character/substrate/liveness/context.ts",
        "declare function makeLivenessCtx(): { db: number };\nexport type LivenessCtx = ReturnType<typeof makeLivenessCtx>;\n",
      ),
    ],
    messageIncludes: "`ReturnType<>` in context.ts",
  },
  {
    policy: noIfIsGroup,
    overlays: [add(`${CHAT}/lib/liveness-group.ts`, "const isGroup = true;\nexport const livenessGroup = isGroup;\n")],
    messageIncludes: "isGroup",
  },
  {
    policy: noInlineOptimisticInSurface,
    overlays: [
      add(
        "packages/client/src/features/character/surfaces/liveness-optimistic-surface.tsx",
        'import { useQueryClient } from "@tanstack/react-query";\nexport function LivenessOptimisticSurface(): void {\n  const queryClient = useQueryClient();\n  queryClient.setQueryData(livenessKey, 1);\n}\n',
      ),
    ],
    messageIncludes: "belongs in `features/<x>/hooks/`",
  },
  {
    policy: noInlineUnionRedecl,
    overlays: [add("packages/contracts/src/liveness-mode.ts", "export type LivenessMode = 'a' | 'b' | 'c';\n")],
    messageIncludes: "TYPE ALIAS",
  },
  {
    policy: noStaticStaletime,
    overlays: [
      add(
        `${CHAT}/lib/liveness-query.ts`,
        'import { useQuery } from "@tanstack/react-query";\nexport const livenessQuery = () => useQuery({ queryKey: livenessKey, staleTime: "static" });\n',
      ),
    ],
    messageIncludes: "silently ignores invalidateQueries",
  },
  {
    policy: noTestFabrication,
    overlays: [add("tests/tooling/liveness-fabrication.test.ts", "declare const source: unknown;\nexport const value = source as any;\n")],
    messageIncludes: "as any",
  },
  {
    policy: persistenceNoInMemoryState,
    // A bare `new Map()` resolves as the ordinary ambient global on the real tree (item 0107): `Map`'s
    // symbol merges lib declarations with the repo's `platform.d.ts` and `@total-typescript/ts-reset`
    // augmentations, and the ambient-identity door now recognizes that mix as one origin instead of
    // refusing it as unreadable.
    overlays: [add(`${CHARACTER_PERSISTENCE}/liveness-cache.ts`, "export const livenessCache = new Map<string, string>();\n")],
    messageIncludes: "in-memory state (caches, registries) belongs in a named subsystem",
  },
  {
    policy: queryMachineSeals,
    overlays: [
      add(
        "packages/client/src/components/liveness-mutation.tsx",
        "import { useMutation } from '@tanstack/react-query';\nexport const livenessMutation = useMutation;\n",
      ),
    ],
    messageIncludes: "useMutation",
  },
  {
    policy: testFixtureImports,
    overlays: [add("tests/server/liveness-fixture.test.ts", 'import { expect, test } from "vitest";\nexport const livenessBindings = [test, expect];\n')],
    messageIncludes: "bypasses the composed fixture",
  },
  {
    policy: testMockDoctrine,
    overlays: [add("tests/tooling/liveness-mock.test.ts", 'import { vi } from "vitest";\nvi.mock("../../packages/server/src/kit/regex/index.ts");\n')],
    messageIncludes: "vi.mock on an internal module",
  },
  {
    policy: zustandSelectorStability,
    overlays: [
      add(
        "packages/client/src/components/liveness-selector.tsx",
        'import { createGatedStore } from "#state";\nconst useLivenessStore = createGatedStore("liveness", { user: "a" });\nexport const LivenessSelector = (): unknown => useLivenessStore((s) => ({ a: s.user }));\n',
      ),
    ],
    messageIncludes: "fresh object/array literal",
  },
];
