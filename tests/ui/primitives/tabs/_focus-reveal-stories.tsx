import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

export function TabsFocusRevealStory({
  width,
  vertical = false,
  manual = false,
  rtl = false,
  cancelFocus = false,
}: {
  readonly width: number;
  readonly vertical?: boolean;
  readonly manual?: boolean;
  readonly rtl?: boolean;
  readonly cancelFocus?: boolean;
}): ReactElement {
  const finalRef = useRef<HTMLButtonElement>(null);
  const [focused, setFocused] = useState(0);
  const [keys, setKeys] = useState(0);
  return (
    <CtIsolation subject="Tabs focus reveal" isolates="The production tabs inside a horizontal clip and an independently scrolling workspace and panel">
      <Stack aria-hidden={true} className="block-(--height-scroll-lg)" />
      <Container dir={rtl ? "rtl" : "ltr"} style={{ inlineSize: width }}>
        <Stack aria-label="Scrolling workspace" className="overflow-y-auto max-block-(--height-scroll-md)" role="region">
          <Text voice="reading">{"Workspace context before the tabs. ".repeat(30)}</Text>
          <Tabs defaultValue="opening" orientation={vertical ? "vertical" : "horizontal"}>
            <Row aria-label="Tab clip" className="overflow-x-auto py-tight min-inline-0" role="region">
              <TabsList activateOnFocus={!manual} aria-label="Review stages">
                <TabsTab value="opening">Opening</TabsTab>
                <TabsTab value="notes">Working notes</TabsTab>
                <TabsTab disabled={true} value="locked">
                  Unavailable
                </TabsTab>
                <TabsTab
                  onFocus={(event): void => {
                    setFocused((count) => count + 1);
                    if (cancelFocus) {
                      event.preventBaseUIHandler();
                    }
                  }}
                  onKeyDown={(): void => setKeys((count) => count + 1)}
                  ref={finalRef}
                  value="final"
                >
                  Final review
                </TabsTab>
              </TabsList>
            </Row>
            {["opening", "notes", "final"].map((value) => (
              <TabsPanel className="overflow-y-auto max-block-(--height-scroll-sm)" key={value} value={value}>
                <Text voice="reading">{`${value}: retain the panel's reading position. `.repeat(50)}</Text>
              </TabsPanel>
            ))}
          </Tabs>
          <Text voice="reading">{"Workspace context after the tabs. ".repeat(30)}</Text>
        </Stack>
        <Button onClick={(): void => finalRef.current?.focus({ preventScroll: true })}>Focus final through caller ref</Button>
        <output aria-label="Final focus calls">{focused}</output>
        <output aria-label="Final key calls">{keys}</output>
      </Container>
      <Stack aria-hidden={true} className="block-(--height-scroll-lg)" />
    </CtIsolation>
  );
}
