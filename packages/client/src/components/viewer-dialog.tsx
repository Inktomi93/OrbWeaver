import type { ReactElement } from "react";
import type { HeaderDismissDialogProps } from "./content-dialog.tsx";
import { ContentDialog } from "./content-dialog.tsx";

/** Read-only content with a persistent dismiss control and a wide default viewport. */
export function ViewerDialog(props: HeaderDismissDialogProps): ReactElement {
  return <ContentDialog {...props} size={props.size ?? "lg"} dismiss={props.dismiss ?? { at: "header" }} />;
}
