import type { ReactElement } from "react";
import type { ContentDialogProps } from "./content-dialog.tsx";
import { ContentDialog, ContentDialogClose } from "./content-dialog.tsx";

/** Read-only content with a persistent dismiss control and a wide default viewport. */
export function ViewerDialog(props: ContentDialogProps): ReactElement {
  return <ContentDialog {...props} popupProps={{ size: "lg", ...props.popupProps }} headerActions={props.headerActions ?? <ContentDialogClose />} />;
}
