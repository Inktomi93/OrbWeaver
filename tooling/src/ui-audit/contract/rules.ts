// Closed vocabulary for every verdict ui-audit can emit. The proof gate reads this table directly;
// behavior code derives Finding.rule from it, so a detector cannot mint an unproved rule id.

export const DESIGN_AUDIT_SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
export type DesignAuditSeverity = (typeof DESIGN_AUDIT_SEVERITIES)[number];

export const DESIGN_AUDIT_RULE_FAMILIES = ["a11y", "color", "decor", "media", "ornament", "quality", "structure", "typography"] as const;
export type DesignAuditRuleFamily = (typeof DESIGN_AUDIT_RULE_FAMILIES)[number];

interface DesignAuditRuleDefinition {
  readonly id: string;
  readonly family: DesignAuditRuleFamily;
  readonly severity: readonly DesignAuditSeverity[];
}

export const DESIGN_AUDIT_RULES = [
  { id: "tap-target", family: "a11y", severity: ["P1", "P2"] },
  // Accounting-only (#1077, orb-ui audit F5): never emits a Finding — its checker is `() => null` —
  // it exists so a rest-hidden reveal cluster (opacity:0 at rest, revealed on hover/focus/coarse) is
  // WITHHELD by name at fine pointer instead of silently vanishing from every census that requires
  // `isVisible`. See ops/walker/census-interactive.ts's header for the two-arm contract.
  { id: "reveal-coverage", family: "a11y", severity: ["P3"] },
  { id: "control-aspect", family: "a11y", severity: ["P2"] },
  { id: "obscured-target", family: "a11y", severity: ["P0", "P1"] },
  { id: "aria-name", family: "a11y", severity: ["P1"] },
  { id: "border-contrast", family: "a11y", severity: ["P2"] },
  { id: "landmark-missing", family: "a11y", severity: ["P2"] },
  { id: "tabindex-positive", family: "a11y", severity: ["P2"] },
  { id: "skipped-heading", family: "a11y", severity: ["P2"] },
  { id: "text-over-art", family: "color", severity: ["P0", "P1"] },
  { id: "contrast", family: "color", severity: ["P1"] },
  { id: "hover-contrast", family: "color", severity: ["P1"] },
  { id: "inactive-control-legibility", family: "color", severity: ["P3"] },
  { id: "gray-on-color", family: "color", severity: ["P2"] },
  { id: "border-accent-on-rounded", family: "decor", severity: ["P3"] },
  { id: "side-tab", family: "decor", severity: ["P3"] },
  { id: "glow-shadow", family: "decor", severity: ["P3"] },
  { id: "distorted-image", family: "media", severity: ["P1", "P2"] },
  // Accounting-only (#1079, orb-ui audit F7): never emits a Finding — every ECharts canvas is EXCLUDED
  // by name (no DOM census can read pixels a canvas paints; no OCR), rather than a silent zero that
  // reads as "no visual content here" on a chart-heavy pane.
  { id: "canvas-ink", family: "media", severity: ["P3"] },
  { id: "broken-image", family: "media", severity: ["P1"] },
  { id: "radial-halo", family: "ornament", severity: ["P2"] },
  { id: "radial-spotlight-glow", family: "ornament", severity: ["P3"] },
  { id: "stripe-background", family: "ornament", severity: ["P3"] },
  { id: "grid-line-background", family: "ornament", severity: ["P3"] },
  { id: "icon-tile-stack", family: "ornament", severity: ["P3"] },
  { id: "layout-transition", family: "ornament", severity: ["P3"] },
  { id: "bounce-easing", family: "ornament", severity: ["P2"] },
  { id: "text-overflow", family: "quality", severity: ["P1"] },
  { id: "truncated-to-nothing", family: "quality", severity: ["P1"] },
  { id: "repeated-container-text", family: "quality", severity: ["P3"] },
  { id: "clipped-overflow", family: "quality", severity: ["P1", "P2"] },
  { id: "edge-flush-cards", family: "quality", severity: ["P3"] },
  { id: "script-error", family: "quality", severity: ["P0"] },
  { id: "duplicate-action-door", family: "quality", severity: ["P3"] },
  { id: "headline-overhang", family: "quality", severity: ["P2"] },
  { id: "inline-padding-leak", family: "quality", severity: ["P1"] },
  { id: "z-index-escalation", family: "structure", severity: ["P2", "P3"] },
  { id: "nested-card", family: "structure", severity: ["P3"] },
  { id: "gradient-text", family: "structure", severity: ["P3"] },
  { id: "animated-img-hover", family: "structure", severity: ["P3"] },
  { id: "cohort-anatomy", family: "structure", severity: ["P2"] },
  { id: "row-void", family: "structure", severity: ["P2"] },
  { id: "selection-idiom", family: "structure", severity: ["P2"] },
  { id: "pane-ink", family: "structure", severity: ["P3"] },
  { id: "quiet-state", family: "color", severity: ["P2"] },
  { id: "double-empty-state", family: "quality", severity: ["P2"] },
  { id: "text-below-ramp", family: "typography", severity: ["P2"] },
  { id: "undersized-ui-text", family: "typography", severity: ["P2"] },
  { id: "line-length", family: "typography", severity: ["P3"] },
  { id: "tight-leading", family: "typography", severity: ["P3"] },
  { id: "justified-text", family: "typography", severity: ["P3"] },
  { id: "all-caps-body", family: "typography", severity: ["P3"] },
  { id: "wide-tracking", family: "typography", severity: ["P3"] },
  { id: "crushed-tracking", family: "typography", severity: ["P3"] },
  { id: "caveat-outweighed", family: "typography", severity: ["P2"] },
  { id: "off-theme-font", family: "typography", severity: ["P2"] },
  { id: "flat-type-hierarchy", family: "typography", severity: ["P3"] },
  { id: "buried-raster", family: "media", severity: ["P1"] },
  { id: "tier-drift", family: "quality", severity: ["P2"] },
  { id: "off-grid-text", family: "typography", severity: ["P2"] },
  { id: "promoted-layer-offset", family: "quality", severity: ["P2"] },
  { id: "off-grid-transform", family: "quality", severity: ["P3"] },
] as const satisfies readonly DesignAuditRuleDefinition[];

export type DesignAuditRuleId = (typeof DESIGN_AUDIT_RULES)[number]["id"];
type DesignAuditRuleDefinitionUnion = (typeof DESIGN_AUDIT_RULES)[number];
export type DesignAuditRuleSeverityById = {
  readonly [RuleId in DesignAuditRuleId]: Extract<DesignAuditRuleDefinitionUnion, { readonly id: RuleId }>["severity"][number];
};
export const DESIGN_AUDIT_RULE_IDS: readonly DesignAuditRuleId[] = DESIGN_AUDIT_RULES.map((rule) => rule.id);
