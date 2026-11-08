// The toast read for component specs. A case names the notice it expects by the copy production computes for it, never by
// "some alert": any toast satisfies a first-alert read, including the generic failure the specific refusal replaced.

import type { Locator, Page } from "@playwright/test";
import { ALERTS_REGION_NAME } from "../../../packages/ui/src/primitives/toast/toast-names.ts";

/** What a toast says: the shape of `NotifyNotice` the client raises, minus the action. */
interface NoticeCopy {
  readonly title: string;
  readonly description?: string | undefined;
}

/**
 * The toast in the Alerts region whose title, and description when given, equals `copy` exactly. Compute `copy` by calling the
 * production mapper that raises the notice (`warningNotice`, `characterRefusalCopy`); a typed string is a copy of production.
 */
export function noticeToast(page: Page, copy: NoticeCopy): Locator {
  const alerts = page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).locator('[data-slot="toast-root"]');
  const titled = alerts.filter({ has: page.locator('[data-slot="toast-title"]').filter({ hasText: new RegExp(`^${RegExp.escape(copy.title)}$`, "u") }) });
  return copy.description === undefined ? titled : titled.filter({ has: page.getByText(copy.description, { exact: true }) });
}
