// Reviewed grants: tests-raw-package-reach, part H — a test file and the raw `#<package>/*` specifiers it reached when
// raw reaches became grant-gated (Core-0-Architecture-and-Structure.md §5). Delete a specifier when its test moves to the
// package's public entry or testing door; central liveness reds a specifier the test no longer imports.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";
import { testsRawPackageReachGrants } from "./reviewed-grants-tests-raw-package-reach-rows.ts";

export const REVIEWED_GRANTS_TESTS_RAW_PACKAGE_REACH_H: readonly ReviewedGateGrant[] = testsRawPackageReachGrants({
  "tests/ui/variant-arm-matrix.def.ts": [
    "#ui/primitives/badge/variants.ts",
    "#ui/primitives/button/variants.ts",
    "#ui/primitives/card/variants.ts",
    "#ui/primitives/checkbox/variants.ts",
    "#ui/primitives/color-field/variants.ts",
    "#ui/primitives/empty-state/variants.ts",
    "#ui/primitives/highlighted-text/variants.ts",
    "#ui/primitives/input/variants.ts",
    "#ui/primitives/kbd/variants.ts",
    "#ui/primitives/list-row/variants.ts",
    "#ui/primitives/picker-cell/variants.ts",
    "#ui/primitives/select/variants.ts",
    "#ui/primitives/slider/variants.ts",
    "#ui/primitives/status-chip/variants.ts",
    "#ui/primitives/switch/variants.ts",
    "#ui/primitives/text/variants.ts",
    "#ui/primitives/textarea/variants.ts",
    "#ui/primitives/toggle/variants.ts",
  ],
  "tests/client/data/stale-session.test.ts": ["#client/data/stale-session.ts"],
  "tests/client/lib/session-channel.test.ts": ["#client/lib/session-channel.ts"],
  "tests/e2e/event-sequence.spec.ts": ["#client/state/active-chat-store.ts"],
  "tests/server/infra/plugin-host/_platform-proof.ts": ["#server/infra/plugin-host/process-runtime.ts"],
});
