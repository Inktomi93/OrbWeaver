// The configured merger treats a logical sizing utility and its physical twin as one axis: the later class wins,
// whichever spelling each side uses. Without the registration both survive and the stylesheet order decides.
import { cn } from "@orb/ui/lib";
import { expect, test } from "vitest";

test.for([
  ["inline-auto", "w-(--size-avatar-hero)"],
  ["w-(--size-avatar-hero)", "inline-auto"],
  ["h-(--size-control-sm)", "block-auto"],
  ["block-auto", "h-(--size-control-sm)"],
  ["min-w-(--size-control-md)", "min-inline-0"],
  ["min-inline-0", "min-w-(--size-control-md)"],
  ["max-inline-full", "max-w-(--size-control-md)"],
  ["max-w-(--size-control-md)", "max-inline-full"],
  ["min-h-0", "min-block-(--size-control-md)"],
  ["max-h-full", "max-block-(--height-scroll-md)"],
] as const)("the later of %s and %s wins the shared axis", ([first, second]) => {
  expect(cn(first, second)).toBe(second);
});

test("a size utility evicts an earlier logical width and height", () => {
  expect(cn("inline-full block-full", "size-(--size-avatar-md)")).toBe("size-(--size-avatar-md)");
});

test("a display utility and a logical size are different axes", () => {
  expect(cn("inline-flex", "inline-full")).toBe("inline-flex inline-full");
  expect(cn("block", "block-full")).toBe("block block-full");
});
