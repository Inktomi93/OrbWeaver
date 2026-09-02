// The `--lighthouse` arm's shapes: the two device arms, the two gather modes, and the receipt snap
// prints and files. Snap's own vocabulary, deliberately NOT Lighthouse's LHR — the report is an
// artifact we write whole, and everything the RESULT line and the accounting block state is derived
// once, in lib/lighthouse-report.ts, from a shape a unit test can build without a browser.
import type { EvidenceGap } from "../../_shared/evidence.ts";

/** `--lighthouse <desktop|mobile>`. The device is NOT a Lighthouse emulation setting here: the mobile
 *  arm rides snap's own `--mobile` descriptor (touch, coarse pointer, DPR 3) and Lighthouse is told to
 *  keep its hands off the screen (`screenEmulation.disabled`), so one device story governs the pixels,
 *  the a11y tree and the audit — see ops/lighthouse.ts. */
export const LIGHTHOUSE_DEVICES = ["desktop", "mobile"] as const;
export type LighthouseDevice = (typeof LIGHTHOUSE_DEVICES)[number];

/** `--lighthouse-mode`. `snapshot` (the DEFAULT) audits the page exactly as the drive queue left it —
 *  every surface under review in this app is client state, and `navigation` reloads and loses it. */
export const LIGHTHOUSE_MODES = ["snapshot", "navigation"] as const;
export type LighthouseMode = (typeof LIGHTHOUSE_MODES)[number];

/** The categories the arm runs. Performance is deliberately absent: a snapshot has no navigation trace,
 *  so every metric audit would be `notApplicable` — and the census (#1195 §1) says the MCP's findings
 *  that snap could not reproduce were all a11y/best-practices/SEO. */
export const LIGHTHOUSE_CATEGORIES = ["accessibility", "best-practices", "seo"] as const;

export interface LighthouseCategoryScore {
  readonly id: string;
  readonly title: string;
  /** 0..1, or null when the category produced no scorable audit — reported as `n/a`, never as 0. */
  readonly score: number | null;
}

export interface LighthouseFailedAudit {
  readonly id: string;
  readonly title: string;
  readonly score: number;
  readonly scoreDisplayMode: string;
  /** How many DOM nodes the audit's own details table blamed (0 for a page-level audit). */
  readonly nodeCount: number;
  /** The first three of those nodes' selectors — enough to reach the defect with `--shot-of`. */
  readonly selectors: readonly string[];
}

export interface LighthouseReceipt {
  readonly device: LighthouseDevice;
  readonly mode: LighthouseMode;
  readonly url: string;
  readonly lighthouseVersion: string;
  readonly categories: readonly LighthouseCategoryScore[];
  /** Audits that produced a real pass/fail score — the denominator every count below is over. */
  readonly auditedCount: number;
  readonly failed: readonly LighthouseFailedAudit[];
  readonly jsonPath: string;
  readonly htmlPath: string;
}

/** A refusal is never a finding: the run measured NOTHING and exits `EXIT.toolError`, per the zero-
 *  hygiene law in `_shared/evidence.ts`. */
export type LighthouseOutcome = { readonly kind: "measured"; readonly receipt: LighthouseReceipt } | { readonly kind: "refused"; readonly gap: EvidenceGap };
