import { CtIsolation } from "@orb/testkit/browser";
import { Tabs, TabsIndicator, TabsList, TabsTab } from "@orb/ui/tabs";
import type { ReactElement } from "react";

/** A tab list with its indicator: a bar painted as a background, and a focusable tab. */
export function ForcedColorsStory(): ReactElement {
  return (
    <CtIsolation subject="Forced colors" isolates="The tab indicator and the keyboard focus indicator under the forced-colors palette">
      <Tabs defaultValue="b">
        <TabsList>
          <TabsTab value="a">Alpha</TabsTab>
          <TabsTab value="b">Beta</TabsTab>
          <TabsIndicator />
        </TabsList>
      </Tabs>
    </CtIsolation>
  );
}
