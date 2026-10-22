import { ListPaneHeaderHost } from "@orb/client/components";
import type { ListPaneHeaderView } from "@orb/client/lib";
import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

interface HeaderStoryProps extends Pick<ListPaneHeaderView, "title" | "accent" | "count"> {
  readonly withBack?: boolean;
  readonly withAction?: boolean;
  readonly width?: string;
}

export function ListPaneHeaderStory({ title, accent, count, withBack = false, withAction = false, width = "32rem" }: HeaderStoryProps): ReactElement {
  const [backs, setBacks] = useState(0);
  const [actions, setActions] = useState(0);
  const view: ListPaneHeaderView = {
    title,
    ...(accent === undefined ? {} : { accent }),
    ...(count === undefined ? {} : { count }),
    ...(withBack ? { back: { label: "Back to all characters", onClick: (): void => setBacks((value) => value + 1) } } : {}),
    ...(withAction
      ? {
          action: (
            <Button intent="primary" onClick={(): void => setActions((value) => value + 1)}>
              New chat
            </Button>
          ),
        }
      : {}),
    overlay: backs === 0 && actions === 0 ? null : <output>{`Back activated ${String(backs)}; action activated ${String(actions)}`}</output>,
  };
  return (
    <Row align="center" justify="between" style={{ width }}>
      <ListPaneHeaderHost useView={(): ListPaneHeaderView => view} />
    </Row>
  );
}
