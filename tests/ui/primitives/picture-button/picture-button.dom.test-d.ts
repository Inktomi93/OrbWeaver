// PictureButton: a content-sized button around a picture that draws nothing, or the neutral ghost tint.
import type { PictureButtonProps } from "@orb/ui/picture-button";
import { PictureButton } from "@orb/ui/picture-button";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("a picture button draws nothing or the ghost tint, at the picture's own size", () => {
  // @ts-expect-error a filled picture hides the picture
  createElement(PictureButton, { variant: "solid" }, "x");
  // @ts-expect-error the old name for drawing nothing is no style at all
  createElement(PictureButton, { variant: "bare" }, "x");
  // @ts-expect-error a picture takes no colour tone
  createElement(PictureButton, { tone: "primary" }, "x");
  // @ts-expect-error the picture is the box, so no scale step
  createElement(PictureButton, { size: "md" }, "x");
  createElement(PictureButton, { cardCorners: "topStart", confirming: true }, "art");
  createElement(PictureButton, { variant: "ghost", shape: "pill" }, "portrait");
  expectTypeOf<NonNullable<PictureButtonProps["variant"]>>().toEqualTypeOf<"ghost">();
});
