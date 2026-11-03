import { CtIsolation } from "@orb/testkit/browser";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import type { ReactElement } from "react";

export function TabsIndicatorStory({
  orientation = "horizontal",
  dir = "ltr",
}: {
  readonly orientation?: "horizontal" | "vertical";
  readonly dir?: "ltr" | "rtl";
}): ReactElement {
  return (
    <CtIsolation subject="Tabs" isolates="The indicator glide and its transition contract need no application services.">
      <Tabs defaultValue="short" orientation={orientation} dir={dir}>
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
