// D336: Icon spells colour by meaning as `tone` and a named ink as `ink`; the two are exclusive.
import { Circle, Icon } from "@orb/ui/icons";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("the old tone values do not compile, and an ink excludes a colour tone", () => {
  // @ts-expect-error a named ink is `ink`, never a tone
  createElement(Icon, { icon: Circle, tone: "muted" });
  // @ts-expect-error the accent ink is the primary tone
  createElement(Icon, { icon: Circle, tone: "accent" });
  // @ts-expect-error `default` is the unset tone
  createElement(Icon, { icon: Circle, tone: "default" });
  // @ts-expect-error an ink would repaint the tone's meaning away
  createElement(Icon, { icon: Circle, tone: "warning", ink: "accolade" });
  createElement(Icon, { icon: Circle, tone: "warning" });
  createElement(Icon, { icon: Circle, ink: "accolade" });
  expectTypeOf<{ icon: typeof Circle; tone: "warning"; ink: "muted" }>().not.toExtend<Parameters<typeof Icon>[0]>();
});
