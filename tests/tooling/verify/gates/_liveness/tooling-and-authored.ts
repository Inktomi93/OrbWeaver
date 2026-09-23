// Real-corpus liveness arms (#2149) for the policies whose declared population is `@tooling` or `@authored`
// (0042's third chunk). DATA, collected by the one runner (`../real-corpus-liveness-family.suite.repo.int.test.ts`),
// which loads the structure run's own corpus once and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE: a new file inside a real tool
// or package for an occurrence policy, every real subject taken away for a blindness tripwire, and a planted
// tail on a real doc or source file (through the ResourceHost's own overlay) for a policy that reads its
// subject as a resource. No add path lands in `tooling/src/verify/gates/`, where it would join the gate
// roster every roster-reading policy in the shared pass sees.
import { gate as danglingDocCite } from "../../../../../tooling/src/verify/gates/dangling-doc-cite.ts";
import { gate as danglingRefCitations } from "../../../../../tooling/src/verify/gates/dangling-ref-citations.ts";
import { gate as danglingRefs } from "../../../../../tooling/src/verify/gates/dangling-refs.ts";
import { gate as evaluateNoScopeCapture } from "../../../../../tooling/src/verify/gates/evaluate-no-scope-capture.ts";
import { gate as memberCardClamped } from "../../../../../tooling/src/verify/gates/member-card-clamped.ts";
import { gate as noContextProvider } from "../../../../../tooling/src/verify/gates/no-context-provider.ts";
import { gate as noDecorators } from "../../../../../tooling/src/verify/gates/no-decorators.ts";
import { gate as noDirectUseform } from "../../../../../tooling/src/verify/gates/no-direct-useform.ts";
import { gate as noForwardRef } from "../../../../../tooling/src/verify/gates/no-forward-ref.ts";
import { gate as noHardcodedModelProse } from "../../../../../tooling/src/verify/gates/no-hardcoded-model-prose.ts";
import { gate as noLegacyReactApi } from "../../../../../tooling/src/verify/gates/no-legacy-react-api.ts";
import { gate as noRawId } from "../../../../../tooling/src/verify/gates/no-raw-id.ts";
import { gate as noRawIntlTime } from "../../../../../tooling/src/verify/gates/no-raw-intl-time.ts";
import { gate as noUseContext } from "../../../../../tooling/src/verify/gates/no-use-context.ts";
import { gate as playwrightLaneOutsideFastCheck } from "../../../../../tooling/src/verify/gates/playwright-lane-outside-fast-check.ts";
import { gate as toolingArgvFrontDoor } from "../../../../../tooling/src/verify/gates/tooling-argv-front-door.ts";
import { gate as toolingArgvFrontDoorHealth } from "../../../../../tooling/src/verify/gates/tooling-argv-front-door-health.ts";
import { gate as toolingArtifactPathHome } from "../../../../../tooling/src/verify/gates/tooling-artifact-path-home.ts";
import { gate as toolingArtifactRunSlot } from "../../../../../tooling/src/verify/gates/tooling-artifact-run-slot.ts";
import { gate as toolingBrowserDoor } from "../../../../../tooling/src/verify/gates/tooling-browser-door.ts";
import { gate as toolingChildProcessDoor } from "../../../../../tooling/src/verify/gates/tooling-child-process-door.ts";
import { gate as toolingFrontDoor } from "../../../../../tooling/src/verify/gates/tooling-front-door.ts";
import { gate as toolingProcessExitHome } from "../../../../../tooling/src/verify/gates/tooling-process-exit-home.ts";
import { gate as toolingProjectHome } from "../../../../../tooling/src/verify/gates/tooling-project-home.ts";
import { gate as toolingRootConfigImport } from "../../../../../tooling/src/verify/gates/tooling-root-config-import.ts";
import { gate as toolingSlotTemplate } from "../../../../../tooling/src/verify/gates/tooling-slot-template.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

const CLIENT = "packages/client/src/features/chat/components";
const LAW_DOC = "docs/law/Spine-Testing.md";

/** Every tool `cli.ts` on the tree. `tooling-argv-front-door-health` is blind only when NONE reads argv, so the
 *  control is all of them; a tool added without joining this list leaves one reader and the arm goes red. */
const TOOL_CLIS = [
  "agent-sync",
  "ast",
  "bug-reports",
  "cache-check",
  "codemod",
  "doc-catalog",
  "doc",
  "model-ab",
  "mutation-arid",
  "mutation-probe",
  "render-trace",
  "review-mirror",
  "seed",
  "snap",
  "verify",
  "wire-tap",
  "workboard",
] as const;

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

export const TOOLING_AND_AUTHORED_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: danglingDocCite,
    // TypeScript citers are read from the structure run's own project; a new module's comment cites a doc
    // that does not exist.
    overlays: [add("packages/kit/src/liveness-doc-cite.ts", "// See docs/design/liveness-gone-forever.md for the ruling.\nexport const livenessCite = 1;\n")],
    messageIncludes: "docs/design/liveness-gone-forever.md",
  },
  {
    policy: danglingRefCitations,
    overlays: [{ kind: "resource", path: LAW_DOC, append: "\nSee `domain/__liveness_ghost__/x.ts` for the shape.\n" }],
    messageIncludes: "__liveness_ghost__",
  },
  {
    policy: danglingRefs,
    overlays: [{ kind: "resource", path: LAW_DOC, append: "\nSee [the retired note](./__liveness-gone.md).\n" }],
    messageIncludes: "__liveness-gone.md",
  },
  {
    policy: evaluateNoScopeCapture,
    overlays: [
      add(
        "tooling/src/snap/ops/liveness-evaluate.ts",
        'const MARK = "data-mark";\nexport async function tag(loc: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> {\n  await loc.evaluate((el: { setAttribute: (n: string, v: string) => void }) => el.setAttribute(MARK, "1"));\n}\n',
      ),
    ],
    messageIncludes: "MODULE-SCOPE binding",
  },
  {
    policy: memberCardClamped,
    overlays: [add("packages/server/src/domain/character/liveness-member-card.ts", "export interface MemberCardView {\n  name: string;\n}\n")],
    messageIncludes: "MemberCardView",
  },
  {
    policy: noContextProvider,
    overlays: [
      add(
        `${CLIENT}/liveness-provider.tsx`,
        'import { createContext } from "react";\nexport const LivenessContext = createContext("night");\nexport function Host({ children }: { children: unknown }): unknown {\n  return <LivenessContext.Provider value="day">{children}</LivenessContext.Provider>;\n}\n',
      ),
    ],
    messageIncludes: "Context.Provider",
  },
  {
    policy: noDecorators,
    overlays: [add("packages/server/src/liveness-decorator.ts", "@Injectable()\nclass LivenessService {}\nexport const service = LivenessService;\n")],
    messageIncludes: "decorators are not erasable",
  },
  {
    policy: noDirectUseform,
    overlays: [
      add(
        "packages/client/src/features/chat/surfaces/liveness-editor.tsx",
        'import { useForm } from "@tanstack/react-form";\nexport const Editor = (): unknown => useForm();\n',
      ),
    ],
    messageIncludes: "raw mint",
  },
  {
    policy: noForwardRef,
    overlays: [
      add(
        `${CLIENT}/liveness-forward-ref.tsx`,
        'import { forwardRef } from "react";\nexport const LivenessInput = forwardRef((props: object, ref: object) => null);\n',
      ),
    ],
    messageIncludes: "forwardRef",
  },
  {
    policy: noHardcodedModelProse,
    overlays: [
      add(
        "packages/server/src/domain/rpg/substrate/liveness-teach.ts",
        'export const LIVENESS_TEACH =\n  "When the scene calls for it, teach the model to answer in the voice of the narrator and keep it steady.";\n',
      ),
    ],
    messageIncludes: "model-facing prose",
  },
  {
    policy: noLegacyReactApi,
    overlays: [add("packages/showcase-plugins/src/liveness-legacy.ts", 'import { cloneElement } from "react";\nexport const copy = cloneElement;\n')],
    messageIncludes: "legacy React API",
  },
  {
    policy: noRawId,
    overlays: [add("packages/contracts/src/liveness-raw-id.ts", 'import { z } from "zod";\nexport const livenessSchema = z.object({ userId: z.string() });\n')],
    messageIncludes: "raw string",
  },
  {
    policy: noRawIntlTime,
    overlays: [add(`${CLIENT}/liveness-intl.tsx`, "export function LivenessStamp(): unknown {\n  return new Intl.DateTimeFormat('en-US');\n}\n")],
    messageIncludes: "Intl",
  },
  {
    policy: noUseContext,
    overlays: [
      add(
        `${CLIENT}/liveness-use-context.tsx`,
        'import { createContext, useContext } from "react";\nconst LivenessContext = createContext("");\nexport function useLiveness(): string {\n  return useContext(LivenessContext);\n}\n',
      ),
    ],
    messageIncludes: "useContext",
  },
  {
    policy: playwrightLaneOutsideFastCheck,
    // The runner table assigns the component family to vitest — the lane a browser suffix must never ride.
    overlays: [
      {
        kind: "neutralise",
        path: "tooling/src/_shared/test-kinds.ts",
        source:
          'const RUNTIME_BY_FAMILY = {\n  unit: "vitest",\n  integration: "vitest",\n  contract: "vitest",\n  type: "vitest-typecheck",\n  component: "vitest",\n  e2e: "playwright-e2e",\n} as const;\n',
      },
    ],
    messageIncludes: "component",
  },
  {
    policy: toolingArgvFrontDoorHealth,
    overlays: [
      { kind: "neutralise", path: `tooling/src/${TOOL_CLIS[0]}/cli.ts`, source: "export {};\n" },
      ...TOOL_CLIS.slice(1).map((tool): RealCorpusOverlay => ({ kind: "neutralise", path: `tooling/src/${tool}/cli.ts`, source: "export {};\n" })),
    ],
    messageIncludes: "blind gate",
  },
  {
    policy: toolingArgvFrontDoor,
    overlays: [add("tooling/src/codemod/lib/liveness-argv.ts", 'import process from "node:process";\nexport const limit = process.argv.slice(2).length;\n')],
    messageIncludes: "a second argv reader",
  },
  {
    policy: toolingArtifactPathHome,
    overlays: [add("tooling/src/snap/ops/liveness-out.ts", 'import { join } from "node:path";\nexport const d = join("/root", "reports", "snaps");\n')],
    messageIncludes: "a hand-rolled reports/<kind> path",
  },
  {
    policy: toolingArtifactRunSlot,
    // A new tool whose ops file artifacts through the real door while its cli.ts opens no run slot.
    overlays: [
      add("tooling/src/livenessunslotted/cli.ts", 'import { shoot } from "./ops/shoot.ts";\nexport const run = shoot;\n'),
      add(
        "tooling/src/livenessunslotted/ops/shoot.ts",
        'import { artifactFile } from "../../_shared/artifact-out.ts";\nexport async function shoot(): Promise<number> {\n  await artifactFile("snaps", "root", ".png");\n  return 0;\n}\n',
      ),
    ],
    messageIncludes: "must open its artifact run slot",
  },
  {
    policy: toolingBrowserDoor,
    overlays: [
      add("tooling/src/snap/ops/liveness-capture.ts", 'import { chromium } from "@playwright/test";\nexport const b = chromium.launch({ headless: true });\n'),
    ],
    messageIncludes: "operation: browser-launch",
  },
  {
    policy: toolingChildProcessDoor,
    overlays: [add("tooling/src/seed/ops/liveness-raw.ts", 'import { spawn } from "node:child_process";\nexport const s = spawn;\n')],
    messageIncludes: "operation: child-process-import",
  },
  {
    policy: toolingFrontDoor,
    overlays: [
      add("tooling/src/snap/ops/liveness-deep.ts", 'import { collectApiSurface } from "../../ast/ops/apisurface.ts";\nexport const x = collectApiSurface;\n'),
    ],
    messageIncludes: "cross-tool deep import",
  },
  {
    policy: toolingProcessExitHome,
    overlays: [add("tooling/src/ast/ops/liveness-bail.ts", 'import process from "node:process";\nexport function bail(): never {\n  process.exit(2);\n}\n')],
    messageIncludes: "a bare process.exit",
  },
  {
    policy: toolingProjectHome,
    overlays: [add("tooling/src/ast/ops/liveness-load.ts", 'import { Project } from "ts-morph";\nexport const p = new Project({});\n')],
    messageIncludes: "a second ts-morph loader",
  },
  {
    policy: toolingRootConfigImport,
    overlays: [add("tooling/src/snap/ops/liveness-root.ts", 'import { castId } from "../../../../packages/kit/src/ids/index.ts";\nexport const x = castId;\n')],
    messageIncludes: "operation: root-config-import:packages/kit/src/ids/index.ts",
  },
  {
    policy: toolingSlotTemplate,
    // A stray module at a tool ROOT, where only cli.ts and index.ts may live.
    overlays: [{ kind: "resource", path: "tooling/src/snap/liveness-stray.ts", source: "export const stray = 1;\n" }],
    messageIncludes: "liveness-stray.ts",
  },
];
