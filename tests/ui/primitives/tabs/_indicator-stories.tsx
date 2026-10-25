import { CtIsolation } from "@orb/testkit/browser";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import type { ReactElement } from "react";

export function TabsIndicatorStory(): ReactElement {
  return (
    <CtIsolation subject="Tabs" isolates="The indicator glide and its transition contract need no application services.">
      <Tabs defaultValue="short">
        <TabsList>
          <TabsTab value="short">Short</TabsTab>
          <TabsTab value="a-much-longer-tab">A much longer tab</TabsTab>
          <TabsIndicator />
        </TabsList>
        <TabsPanel value="short">Short body</TabsPanel>
        <TabsPanel value="a-much-longer-tab">Long body</TabsPanel>
      </Tabs>
    </CtIsolation>
  );
}
