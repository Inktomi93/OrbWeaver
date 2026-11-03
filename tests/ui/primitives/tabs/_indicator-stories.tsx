import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

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

export function TabsRefsStory({ cleanup = true }: { readonly cleanup?: boolean }): ReactElement {
  const panel = useRef<HTMLDivElement>(null);
  const [attached, setAttached] = useState(false);
  const [shown, setShown] = useState(true);
  const [renders, setRenders] = useState(0);
  const attachments = useRef(0);
  return (
    <CtIsolation subject="Tabs refs" isolates="Native caller refs share the actual nodes used by the seal">
      <Button onClick={(): void => panel.current?.focus()}>Focus tab panel</Button>
      <Button onClick={(): void => setShown(false)}>Remove tabs</Button>
      <Button aria-label="Render tabs again" onClick={(): void => setRenders((count) => count + 1)}>
        Render {renders}
      </Button>
      <span role="status">{attached ? "Indicator attached" : "Indicator detached"}</span>
      {shown ? (
        <Tabs defaultValue="body">
          <TabsList>
            <TabsTab value="body">Body</TabsTab>
            <TabsIndicator
              ref={(node): (() => void) | undefined => {
                if (node !== null) {
                  attachments.current += 1;
                  node.dataset["refAttachments"] = String(attachments.current);
                }
                setAttached(node !== null);
                return cleanup ? (): void => setAttached(false) : undefined;
              }}
            />
          </TabsList>
          <TabsPanel value="body" ref={panel}>
            Readable body
          </TabsPanel>
        </Tabs>
      ) : null}
    </CtIsolation>
  );
}
