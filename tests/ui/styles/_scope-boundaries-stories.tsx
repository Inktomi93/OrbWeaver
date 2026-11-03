import { CtAppearanceChannels, CtIsolation } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import { Surface } from "@orb/ui/layout";
import { ScrollArea, useScrollFadeX } from "@orb/ui/scroll-area";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useRef } from "react";

export function ScopeBoundariesStory({ wide = false, dir = "ltr" }: { readonly wide?: boolean; readonly dir?: "ltr" | "rtl" }): ReactElement {
  const scroller = useRef<HTMLElement>(null);
  useScrollFadeX(scroller);
  return (
    <CtIsolation subject="Scope boundaries" isolates="Density inheritance, bounded focus and asynchronous scroll geometry through their production primitives">
      <CtAppearanceChannels settings={{ surfaceTexture: "grain" }}>
        <Surface tier="form">
          <ThemeScope tokens={{ density: "compact", radius: "control" }}>
            <Card data-case="scoped-card">Scoped card</Card>
            <Surface tier="instrument">
              <Card data-case="instrument-card">Instrument card</Card>
            </Surface>
          </ThemeScope>
        </Surface>
        <ScrollArea style={{ width: 240, height: 80 }} viewportProps={{ tabIndex: 0, role: "region", "aria-label": "Bounded scroll area" }}>
          <div style={{ height: 240 }}>Scrollable content</div>
        </ScrollArea>
        <section ref={scroller} dir={dir} aria-label="Growing strip" style={{ width: 100, overflowX: "auto" }}>
          <div style={{ width: wide ? 300 : 50, height: 20 }}>Content</div>
        </section>
      </CtAppearanceChannels>
    </CtIsolation>
  );
}
