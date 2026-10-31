import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import type { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** The call-to-action Button and the active tab of a Tabs list, the two ring carriers a primitive owns, under a seed palette. */
export function GradientRingStory({ theme }: { readonly theme?: keyof typeof SEED_THEME_VALUE_SETS }): ReactElement {
  return (
    <CtIsolation subject="Gradient ring" isolates="The border-only gradient ring on the CTA and the active tab under each seed palette">
      <div data-theme={theme}>
        <Button>Call to action</Button>
        <Tabs defaultValue="first">
          <TabsList>
            <TabsTab value="first">First</TabsTab>
            <TabsTab value="second">Second</TabsTab>
          </TabsList>
          <TabsPanel value="first">First body</TabsPanel>
          <TabsPanel value="second">Second body</TabsPanel>
        </Tabs>
      </div>
    </CtIsolation>
  );
}
