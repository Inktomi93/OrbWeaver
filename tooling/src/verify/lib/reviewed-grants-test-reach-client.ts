// Reviewed grants: test-reach — the client and ui surfaces. Each row is a module no test reached when the client and ui
// demand moved from the file mirror to reach (docs/law/Spine-Testing.md §5); the burn-down is docs/work item 915.
// Delete a row when a test reaches its module; central liveness reds a row whose module is reached.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";
import { testReachGrants } from "./reviewed-grants-test-reach-rows.ts";

export const REVIEWED_GRANTS_TEST_REACH_CLIENT: readonly ReviewedGateGrant[] = [
  ...testReachGrants("client-seal", [
    "packages/client/src/data/invalidation-user.ts",
    "packages/client/src/forms/editor/focus-invalid-field.ts",
    "packages/client/src/forms/editor/section-save-status.tsx",
  ]),
  ...testReachGrants("ui-logic", [
    "packages/ui/src/charts/chart/chart-renderer.tsx",
    "packages/ui/src/charts/chart/data-table.ts",
    "packages/ui/src/charts/chart/label-metrics.ts",
    "packages/ui/src/charts/chart/use-measured-width.ts",
    "packages/ui/src/charts/meter/coin-figure.tsx",
    "packages/ui/src/charts/meter/waystone-layers.tsx",
    "packages/ui/src/content/immersive-card/inert-card.tsx",
    "packages/ui/src/content/sandbox-frame/srcdoc.ts",
    "packages/ui/src/content/sandbox-frame/use-sandbox-theme.ts",
    "packages/ui/src/content/theme-scope/derive-vars.ts",
    "packages/ui/src/markdown/dice-inline.tsx",
    "packages/ui/src/stream/shimmer.tsx",
    "packages/ui/src/stream/typing-dots.tsx",
    "packages/ui/src/stream/use-smooth-text.ts",
  ]),
];
