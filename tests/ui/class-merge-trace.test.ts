// Each conflict the merge trace records names the family of its class pair: a class joins a token family through that family's utility or variable,
// never because its last word spells a token of another family. `snap --cascade` reads this axis.
import { expect, test } from "@orb/testkit/node";
import { cn, cssMergeTrace } from "@orb/ui/lib";

function axisOf(loser: string, winner: string): string | undefined {
  cssMergeTrace.enable();
  cn(loser, winner);
  const { receipts } = cssMergeTrace.read();
  return receipts[0]?.conflicts[0]?.axis;
}

test.for([
  // Core utilities whose keyword is also a token name: `col`, `full` and `normal` are tokens of spacing, radius and font-weight.
  ["flex-col", "flex-row", "tailwind-core"],
  ["inline-full", "inline-auto", "tailwind-core"],
  ["whitespace-nowrap", "whitespace-normal", "tailwind-core"],
  ["items-center", "items-baseline", "tailwind-core"],
  ["justify-end", "justify-between", "tailwind-core"],
  ["text-shadow-wordmark", "text-shadow-none", "tailwind-core"],
] as const)("%s under %s stays out of every token family", ([loser, winner, axis]) => {
  expect(axisOf(loser, winner)).toBe(axis);
});

test.for([
  ["gap-tight", "gap-field", "orb:spacing"],
  ["gap-0", "gap-block", "orb:spacing"],
  // Utilities only the merger's own config names.
  ["inset-s-tight", "inset-s-0", "orb:spacing"],
  ["inset-e-tight", "inset-e-0", "orb:spacing"],
  ["border-spacing-tight", "border-spacing-0", "orb:spacing"],
  ["border-spacing-x-tight", "border-spacing-x-0", "orb:spacing"],
  ["translate-z-tight", "translate-z-0", "orb:spacing"],
  ["-mx-block", "-mx-gutter", "orb:spacing"],
  ["rounded-none", "rounded-control", "orb:radius"],
  ["leading-tight", "leading-body", "orb:leading"],
  ["text-label", "text-title", "orb:text"],
  ["h-auto", "h-(--size-control-sm)", "orb:size"],
  ["max-inline-none", "max-inline-(--width-sidebar-sm)", "orb:width"],
  ["opacity-50", "opacity-receded", "orb:opacity"],
  ["hover:gap-tight", "hover:gap-field", "orb:spacing"],
  ["ring-1", "ring-(length:--border-width-rule)", "orb:border-width"],
] as const)("%s under %s names its token family", ([loser, winner, axis]) => {
  expect(axisOf(loser, winner)).toBe(axis);
});
