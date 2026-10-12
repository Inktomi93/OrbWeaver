import type { ReactElement } from "react";
import type { ContentDialogProps } from "./content-dialog.tsx";
import { ContentDialog } from "./content-dialog.tsx";

/** Caller-owned stages and actions beneath one pinned heading, without implicit form submission. */
export function FlowDialog(props: ContentDialogProps): ReactElement {
  return <ContentDialog {...props} />;
}
