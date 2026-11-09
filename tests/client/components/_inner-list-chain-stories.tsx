import { LibraryListRows, ListPage } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import type { ReactElement } from "react";
import { useRef } from "react";

const ROW_COUNT = 40;
const ROW_HEIGHT_PX = 40;
const ROWS = Array.from({ length: ROW_COUNT }, (_, index) => ({ id: `row-${String(index + 1)}`, title: `Row ${String(index + 1)}` }));

function LibraryList(): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <ListPage
      body="scroll"
      ref={ref}
      search={<Input aria-label="Search rows" onValueChange={(): void => undefined} placeholder="Search rows" value="" />}
      skipTo="Skip to rows"
    >
      <LibraryListRows isEmpty={false} scroll={false}>
        {ROWS.map(({ id, title }) => (
          <ListRow clickable={true} key={id} onClick={(): void => undefined} title={title} />
        ))}
      </LibraryListRows>
    </ListPage>
  );
}

function VirtualRows(): ReactElement {
  return (
    <VirtualList
      aria-label="Rows"
      estimateSize={(): number => ROW_HEIGHT_PX}
      getItemKey={(item): string => item.id}
      height="fill"
      items={ROWS}
      renderItem={(item): ReactElement => <div style={{ height: ROW_HEIGHT_PX }}>{item.title}</div>}
    />
  );
}

const LISTS = { library: LibraryList, virtual: VirtualRows } as const;

/** One of the two lists that fill a pane, inside a bounded region that scrolls and holds a band above the list, so the list covers the region's whole port. */
export function InnerListChainStory({ list }: { readonly list: keyof typeof LISTS }): ReactElement {
  const List = LISTS[list];
  return (
    <CtIsolation subject="the inner lists" isolates="a list that fills the whole port of the scrolling region around it">
      <div style={{ inlineSize: "18rem", blockSize: "20rem", display: "flex", flexDirection: "column" }}>
        <Stack data-region="outer" height="fill" scroll="y">
          <Text>A band above the list</Text>
          <div style={{ blockSize: "100%", flex: "none", display: "flex", flexDirection: "column" }}>
            <List />
          </div>
        </Stack>
      </div>
    </CtIsolation>
  );
}
