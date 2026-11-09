// A control toast a spec raises after the failure it watches. The toaster renders notices in the order they are raised,
// so once the control toast is visible, any toast the earlier failure raised is mounted too. A zero count read after that
// point cannot pass on a toast that has not mounted yet.
import { notify } from "@orb/client/lib";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";

/** A button named `notice` that raises `notice` as an info toast through the production notify seam. */
export function CtNoticeControl({ notice }: { readonly notice: string }): ReactElement {
  return <Button onClick={(): void => notify.info(notice)}>{notice}</Button>;
}
