import type { Page, Request } from "@playwright/test";
import { errors } from "@playwright/test";

/** The product restores focus a frame or two after a confirmation closes; a body that still holds focus after this is stranded. */
export const FOCUS_RESTORE_MS = 1500;

export const STRANDED_FOCUS_FINDING = "focus was left on the page body after deleting";
export const REREAD_FINDING = "the deleted id was read again after the delete landed";

const TRPC_PATH_PREFIX = "/api/trpc/";

export interface DeleteWatch {
  /** What a delete left wrong: focus stranded on the page body, or a query for the deleted id issued after the delete landed. Empty when clean. */
  readonly findings: () => Promise<readonly string[]>;
  readonly stop: () => void;
}

/** Watch one delete from the moment its action starts. A tRPC mutation's response marks the delete as landed, because the page
 *  cannot issue a follow-up request before it has that response; a query carrying the deleted id after that point is a read of
 *  a record the page was just told is gone. */
export function watchDelete(page: Page, deletedId: string): DeleteWatch {
  let landed = false;
  const readsAfterDelete: string[] = [];
  const isTrpc = (request: Request): boolean => new URL(request.url()).pathname.startsWith(TRPC_PATH_PREFIX);
  const onResponse = (response: { readonly request: () => Request }): void => {
    const request = response.request();
    if (request.method() !== "GET" && isTrpc(request)) {
      landed = true;
    }
  };
  const onRequest = (request: Request): void => {
    if (!landed || request.method() !== "GET" || !isTrpc(request)) {
      return;
    }
    const url = new URL(request.url());
    if ([...url.searchParams.values()].some((value) => value.includes(deletedId))) {
      readsAfterDelete.push(`${url.pathname}${url.search}`);
    }
  };
  page.on("response", onResponse);
  page.on("request", onRequest);
  return {
    findings: async (): Promise<readonly string[]> => {
      const found: string[] = [];
      if (await focusStaysOnBody(page)) {
        found.push(`${STRANDED_FOCUS_FINDING} ${deletedId}`);
      }
      for (const read of readsAfterDelete) {
        found.push(`${REREAD_FINDING}: ${read}`);
      }
      return found;
    },
    stop: (): void => {
      page.off("response", onResponse);
      page.off("request", onRequest);
    },
  };
}

async function focusStaysOnBody(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => document.activeElement !== null && document.activeElement !== document.body && document.activeElement !== document.documentElement,
      undefined,
      {
        timeout: FOCUS_RESTORE_MS,
      },
    );
    return false;
  } catch (error) {
    if (error instanceof errors.TimeoutError) {
      return true;
    }
    throw error;
  }
}
