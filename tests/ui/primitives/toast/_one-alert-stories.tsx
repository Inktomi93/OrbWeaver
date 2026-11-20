import { notify } from "@orb/client/lib";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { ERROR_NOTICE_TITLE, RAISE_ERROR_NAME } from "./one-alert-names.ts";

/** A control that raises one error notice through the app's own `notify` seam, under the production notice binding and toast outlet. */
export function ErrorNoticeStory(): ReactElement {
  return (
    <CtClientProviders>
      <Button onClick={(): void => notify.error(ERROR_NOTICE_TITLE)}>{RAISE_ERROR_NAME}</Button>
    </CtClientProviders>
  );
}
