// Real-corpus liveness arms (#2149) for the policies whose declared population is `@client` alone or `@ui`
// alone, each with its own `under`/`notUnder`/`named`/`ext` narrowing — the ones the exact-population chunks
// (`client-app.ts`, `frontend.ts`) left behind (0042's fifth chunk). DATA, collected by the one runner
// (`./runner.ts`), which loads each isolated structure corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE: a new file importing the real
// door (`@orb/ui/*`, `#state`, `#data`, `#components`, the installed Base UI and zustand types), the real home a
// tripwire watches rewritten or removed, and the real Base UI anatomy manifest left as it is on disk. Every
// add path and name is this arm's own, because the add arms share one overlaid pass.

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";

import { gate as formFactoryForMultifield } from "../../../../../tooling/src/verify/gates/form-factory-for-multifield.ts";
import { gate as noEffectOnSharedSelection } from "../../../../../tooling/src/verify/gates/no-effect-on-shared-selection.ts";
import { gate as noFormResetInAutosaveHealth } from "../../../../../tooling/src/verify/gates/no-form-reset-in-autosave-health.ts";

import { gate as surfaceInAContainer } from "../../../../../tooling/src/verify/gates/surface-in-a-container.ts";
import { gate as uiAccnameSurvivesSpread } from "../../../../../tooling/src/verify/gates/ui-accname-survives-spread.ts";
import { gate as uiVariantAxesStamped } from "../../../../../tooling/src/verify/gates/ui-variant-axes-stamped.ts";
import { gate as uiVariantAxesStampedHealth } from "../../../../../tooling/src/verify/gates/ui-variant-axes-stamped-health.ts";

const CHAT = "packages/client/src/features/chat";
const UI = "packages/ui/src/primitives";

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

function neutralise(path: string, source: string): RealCorpusOverlay {
  return { kind: "neutralise", path, source };
}

export const CLIENT_UI_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: formFactoryForMultifield,
    overlays: [
      add(
        `${CHAT}/components/liveness-hand-rolled.tsx`,
        "export const LivenessForm = () => (\n  <div>\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n    <input value={c} onChange={z} />\n  </div>\n);\n",
      ),
    ],
    messageIncludes: "controlled form inputs",
  },
  {
    policy: noEffectOnSharedSelection,
    overlays: [
      add(
        `${CHAT}/hooks/use-liveness-effect.ts`,
        'import { useEffect } from "react";\nimport { useActiveChatId } from "#state";\nexport function useLivenessEffect(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n',
      ),
    ],
    messageIncludes: "shared-selection pointer",
  },
  {
    policy: noFormResetInAutosaveHealth,
    overlays: [
      neutralise("packages/client/src/forms/editor/autosave-contract.ts", "export interface AutosaveSession {\n  readonly form: { reset: () => void };\n}\n"),
    ],
    messageIncludes: "reset type-strip",
  },

  {
    policy: surfaceInAContainer,
    // A feature that provides no container of its own: every existing feature's surfaces may be contained by
    // the feature, so the control is a surface in a new one.
    overlays: [
      add(
        "packages/client/src/features/livenessprobe/surfaces/liveness-probe-surface.tsx",
        "export const LivenessProbeSurface = () => <div><ul><li>row</li></ul></div>;\n",
      ),
    ],
    messageIncludes: "sits in no <Container>",
  },
  {
    policy: uiAccnameSurvivesSpread,
    overlays: [
      add(
        `${UI}/liveness-accname/liveness-accname.tsx`,
        'export function LivenessStack({ className, items, ...rest }: { className?: string; items: string[]; \'aria-label\'?: string }) {\n  return <div {...rest} aria-label="N people" className={className} data-slot="x" role="group" />;\n}\n',
      ),
    ],
    messageIncludes: "AFTER the caller-props spread",
  },
  {
    policy: uiVariantAxesStampedHealth,
    overlays: [
      neutralise(
        "packages/ui/src/lib/variant-attrs.ts",
        'export const AXES = ["variant", "size"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
      ),
    ],
    messageIncludes: "Missing: the axis tuple",
  },
  {
    policy: uiVariantAxesStamped,
    overlays: [
      add(
        `${UI}/liveness-stamp/variants.ts`,
        'import { tv } from "tailwind-variants";\nexport const livenessVariants = tv({ base: "inline-flex", variants: { size: { sm: "h-control-sm", md: "h-control-md" } } });\n',
      ),
      add(
        `${UI}/liveness-stamp/liveness-stamp.tsx`,
        'import { livenessVariants } from "./variants.ts";\nexport const LivenessStamp = (): unknown => <div className={livenessVariants({ size: "sm" })} />;\n',
      ),
    ],
    messageIncludes: "A1 unstamped:",
  },
];
