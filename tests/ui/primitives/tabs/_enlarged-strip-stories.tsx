import { CtIsolation } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import { Tabs, TabsList, TabsTab } from "@orb/ui/tabs";
import type { ReactElement } from "react";

const STAGES = [
  ["opening", "Opening"],
  ["notes", "Working notes"],
  ["opinion", "Second opinion"],
  ["final", "Final review"],
  ["ledger", "Sign-off ledger"],
] as const;

type Stage = (typeof STAGES)[number][0];

/** The default tab list in a pane that scrolls sideways when something widens it, the way a settings column does. */
export function EnlargedStripStory({ width, selected }: { readonly width: number; readonly selected: Stage }): ReactElement {
  return (
    <CtIsolation subject="Tabs" isolates="A strip of more tabs than its pane holds needs no application services.">
      <Container aria-label="Pane" role="region" scroll="y" style={{ inlineSize: width }}>
        <Tabs defaultValue={selected}>
          <TabsList aria-label="Review stages">
            {STAGES.map(([value, label]) => (
              <TabsTab key={value} value={value}>
                {label}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      </Container>
    </CtIsolation>
  );
}
