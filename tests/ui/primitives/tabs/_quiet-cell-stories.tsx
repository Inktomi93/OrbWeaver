import { CtIsolation } from "@orb/testkit/browser";
import { Tabs, TabsList, TabsTab } from "@orb/ui/tabs";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** A rail that does not hold the current view: both cells are quiet, one is the roving stop. */
export function QuietCellStory(): ReactElement {
  return (
    <CtIsolation subject="Tabs" isolates="A quiet rail cell steps its resting ink down and nothing else">
      <Tabs defaultValue={null}>
        <TabsList>
          <TabsTab data-case="first" layout="cell" quiet={true} value="a">
            First
          </TabsTab>
          <TabsTab data-case="second" layout="cell" quiet={true} value="b">
            Second
          </TabsTab>
        </TabsList>
      </Tabs>
      <span data-probe="quiet" style={{ opacity: `var(${TOKENS["opacity.quiet"].cssVar})` }} />
    </CtIsolation>
  );
}
