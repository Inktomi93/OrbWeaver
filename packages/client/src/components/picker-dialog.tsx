import type { ReactElement } from "react";
import type { HeaderDismissDialogProps } from "./content-dialog.tsx";
import { ContentDialog } from "./content-dialog.tsx";

/** Selection surface whose header stays put as filtered results change height. */
export function PickerDialog(props: HeaderDismissDialogProps): ReactElement {
  return <ContentDialog {...props} anchor={props.anchor ?? "top"} dismiss={props.dismiss ?? { at: "header" }} />;
}
