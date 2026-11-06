import type { ReactElement } from "react";
import type { ContentDialogProps } from "./content-dialog.tsx";
import { ContentDialog, ContentDialogClose } from "./content-dialog.tsx";

/** Selection surface whose header stays put as filtered results change height. */
export function PickerDialog(props: ContentDialogProps): ReactElement {
  return <ContentDialog {...props} anchor={props.anchor ?? "top"} headerActions={props.headerActions ?? <ContentDialogClose />} />;
}
