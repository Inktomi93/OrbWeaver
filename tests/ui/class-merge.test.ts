// The configured merger treats a logical utility and its physical twin as one axis: the later class wins,
// whichever spelling each side uses. Without the registration both survive and the stylesheet order decides.
import { expect, test } from "@orb/testkit/node";
import { cn } from "@orb/ui/lib";

const PAIRS: Readonly<Record<string, readonly (readonly [first: string, second: string])[]>> = {
  sizing: [
    ["inline-auto", "w-(--size-avatar-hero)"],
    ["h-(--size-control-sm)", "block-auto"],
    ["min-w-(--size-control-md)", "min-inline-0"],
    ["max-inline-full", "max-w-(--size-control-md)"],
    ["min-h-0", "min-block-(--size-control-md)"],
    ["max-h-full", "max-block-(--height-scroll-md)"],
  ],
  padding: [
    ["pl-row", "ps-0"],
    ["pe-field", "pr-0"],
    ["pt-row", "pbs-0"],
    ["pbe-field", "pb-0"],
  ],
  margin: [
    ["ml-auto", "ms-0"],
    ["me-row", "mr-0"],
    ["mt-row", "mbs-0"],
    ["mbe-field", "mb-0"],
  ],
  inset: [
    ["left-0", "start-full"],
    ["end-0", "right-full"],
    ["top-0", "inset-bs-full"],
    ["inset-be-0", "bottom-full"],
  ],
  "border width": [
    ["border-l-2", "border-s-0"],
    ["border-e-2", "border-r-0"],
    ["border-t-2", "border-bs-0"],
    ["border-be-2", "border-b-0"],
  ],
  "border colour": [
    ["border-l-primary", "border-s-transparent"],
    ["border-e-primary", "border-r-transparent"],
    ["border-t-primary", "border-bs-transparent"],
    ["border-be-primary", "border-b-transparent"],
  ],
  radius: [
    ["rounded-l-control", "rounded-s-none"],
    ["rounded-e-control", "rounded-r-none"],
    ["rounded-tl-control", "rounded-ss-none"],
    ["rounded-se-control", "rounded-tr-none"],
    ["rounded-br-control", "rounded-ee-none"],
    ["rounded-es-control", "rounded-bl-none"],
  ],
  "scroll margin and padding": [
    ["scroll-ml-row", "scroll-ms-0"],
    ["scroll-me-row", "scroll-mr-0"],
    ["scroll-mt-row", "scroll-mbs-0"],
    ["scroll-mbe-row", "scroll-mb-0"],
    ["scroll-pl-row", "scroll-ps-0"],
    ["scroll-pe-row", "scroll-pr-0"],
    ["scroll-pt-row", "scroll-pbs-0"],
    ["scroll-pbe-row", "scroll-pb-0"],
  ],
};

for (const [family, pairs] of Object.entries(PAIRS)) {
  test.for(pairs)(`${family}: the later of %s and %s wins the shared axis, in either order`, ([first, second]) => {
    expect(cn(first, second)).toBe(second);
    expect(cn(second, first)).toBe(first);
  });
}

test("a physical axis utility evicts the logical sides it covers", () => {
  expect(cn("inline-full block-full", "size-(--size-avatar-md)")).toBe("size-(--size-avatar-md)");
  expect(cn("rounded-ss-control rounded-se-control", "rounded-t-none")).toBe("rounded-t-none");
  expect(cn("rounded-tl-control rounded-bl-control", "rounded-s-none")).toBe("rounded-s-none");
  expect(cn("ps-row pe-row", "px-0")).toBe("px-0");
});

// Tailwind emits logical radius utilities before the physical sides, so the later logical class keeps its corners only by eviction.
test.for([
  ["rounded-t-card", "rounded-ss-none"],
  ["rounded-t-card", "rounded-se-none"],
  ["rounded-b-card", "rounded-es-none"],
  ["rounded-b-card", "rounded-ee-none"],
  ["rounded-l-card", "rounded-ss-none"],
  ["rounded-l-card", "rounded-es-none"],
  ["rounded-r-card", "rounded-se-none"],
  ["rounded-r-card", "rounded-ee-none"],
  ["rounded-t-card", "rounded-s-none"],
  ["rounded-t-card", "rounded-e-none"],
  ["rounded-b-card", "rounded-s-none"],
  ["rounded-b-card", "rounded-e-none"],
] as const)("%s then %s: the later logical class evicts the physical side", ([side, logical]) => {
  expect(cn(side, logical)).toBe(logical);
});

test("a later physical side keeps the logical corner beside it, since the side sorts after it", () => {
  expect(cn("rounded-ss-none", "rounded-t-card")).toBe("rounded-t-card");
  expect(cn("rounded-s-none", "rounded-t-card")).toBe("rounded-s-none rounded-t-card");
});

test("the selection rail's physical spelling and a logical reset resolve per axis and modifier", () => {
  // The width reset evicts the physical width; the rest colour has no later twin and stays; the selected colour is evicted under its modifier.
  expect(cn("border-l-2 border-l-transparent data-selected:border-l-primary", "border-s-0 data-selected:border-s-transparent")).toBe(
    "border-l-transparent border-s-0 data-selected:border-s-transparent",
  );
});

test("a display utility and a logical size are different axes", () => {
  expect(cn("inline-flex", "inline-full")).toBe("inline-flex inline-full");
  expect(cn("block", "block-full")).toBe("block block-full");
});

test("the receded opacity token and a stock opacity step are one axis", () => {
  expect(cn("opacity-50", "opacity-receded")).toBe("opacity-receded");
  expect(cn("opacity-receded", "opacity-100")).toBe("opacity-100");
});
