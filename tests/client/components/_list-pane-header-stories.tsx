import { ListPaneHeaderHost } from "@orb/client/components";
import type { ListPaneHeaderView } from "@orb/client/lib";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Plus } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

interface HeaderStoryProps extends Pick<ListPaneHeaderView, "title" | "accent" | "count"> {
  readonly withBack?: boolean;
  readonly withAction?: boolean;
  /** Further actions after the first, each its own wide button, so a narrow band has more than it can seat inline. */
  readonly extraActions?: number;
  readonly width?: string;
}

export function ListPaneHeaderStory({
  title,
  accent,
  count,
  withBack = false,
  withAction = false,
  extraActions = 0,
  width = "32rem",
}: HeaderStoryProps): ReactElement {
  const [backs, setBacks] = useState(0);
  const [actions, setActions] = useState(0);
  const bump = (): void => setActions((value) => value + 1);
  const action = (id: string, label: string): NonNullable<ListPaneHeaderView["actions"]>[number] => ({
    id,
    inline: <Button onClick={bump}>{label}</Button>,
    menu: [{ id, label, icon: Plus, onSelect: bump }],
  });
  const view: ListPaneHeaderView = {
    title,
    ...(accent === undefined ? {} : { accent }),
    ...(count === undefined ? {} : { count }),
    ...(withBack ? { back: { label: "Back to all characters", onClick: (): void => setBacks((value) => value + 1) } } : {}),
    ...(withAction
      ? {
          actions: [action("new-chat", "New chat"), ...Array.from({ length: extraActions }, (_unused, index) => action(`more-${index}`, `Action ${index}`))],
        }
      : {}),
    overlay: backs === 0 && actions === 0 ? null : <output>{`Back activated ${String(backs)}; action activated ${String(actions)}`}</output>,
  };
  return (
    <CtIsolation subject="ListPaneHeaderHost" isolates="The host renders the view it is given and reads no application data.">
      <Row align="center" justify="between" style={{ width }}>
        <ListPaneHeaderHost useView={(): ListPaneHeaderView => view} />
      </Row>
    </CtIsolation>
  );
}
