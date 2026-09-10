// Full authored TypeScript membership, with unresolved intent exposed instead of counted as clean.
import type { World } from "../../_shared/project-worlds.ts";
import type { AmbientScope } from "../../_shared/type-config-intent.ts";

/** Required owner present, explicit ambient scope, wrong root, closure-only, absent, or unresolved intent. */
export const MEMBERSHIP_OUTCOMES = ["predicted", "ambient", "drift", "import-only", "unowned", "unclassified"] as const;
export type MembershipOutcome = (typeof MEMBERSHIP_OUTCOMES)[number];
export const MEMBERSHIP_ENFORCEMENT = "world-ownership-ambient-distribution-and-closure-libraries";

/** Primary ownership and complete actual membership are separate facts. */
export interface MembershipRow {
  readonly file: string;
  readonly world: World | null;
  /** Authored distribution label. Phase 6 compares its expected program set; this field alone is not that verdict. */
  readonly ambientScope: AmbientScope | null;
  /** The required primary owner; null means the model has not assigned one. */
  readonly predicted: string | null;
  /** The programs that ROOT the file (include/files resolution through the compiler's own config reader). */
  readonly rootedBy: readonly string[];
  /** The programs whose import CLOSURE contains the file. */
  readonly containedBy: readonly string[];
  /** Exact concrete program set required for an ambient; empty for ordinary sources. */
  readonly expectedPrograms: readonly string[];
  readonly outcome: MembershipOutcome;
}

export interface ClosureLeak {
  readonly program: string;
  readonly world: World;
  readonly kind: "node-declarations" | "browser-libraries";
  readonly files: readonly string[];
}

export interface RoutingParityViolation {
  readonly program: string;
  readonly file: string;
  readonly observedBy: "shared-parser" | "native-ts7";
}

export interface MembershipReport {
  readonly enforcement: typeof MEMBERSHIP_ENFORCEMENT;
  readonly programs: readonly string[];
  readonly rows: readonly MembershipRow[];
  readonly testEscapees: readonly string[];
  readonly libLeaks: readonly string[];
  readonly unknownPrograms: readonly string[];
  readonly closureLeaks: readonly ClosureLeak[];
  readonly routingParityViolations: readonly RoutingParityViolation[];
}
