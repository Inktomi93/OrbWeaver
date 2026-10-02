import type { ReactElement } from "react";
import type { ListPaneHeaderView } from "#lib";
import { ListPaneHeader } from "./list-pane-header.tsx";

/** Key the host when the hook producer changes, so each section keeps its own hook lifecycle. */
export function ListPaneHeaderHost({ useView }: { readonly useView: (() => ListPaneHeaderView) | undefined }): ReactElement | null {
  return useView === undefined ? null : <ResolvedListPaneHeader useView={useView} />;
}

function ResolvedListPaneHeader({ useView }: { readonly useView: () => ListPaneHeaderView }): ReactElement {
  const { overlay, ...view } = useView();
  return (
    <>
      <ListPaneHeader {...view} />
      {overlay}
    </>
  );
}
