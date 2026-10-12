// CT stub for the public `/api/auth/me` probe, typed by the client's own `AuthMe` so a renamed wire field
// turns every stub red instead of shipping an untyped JSON literal.

import type { AuthMe } from "@orb/client/data";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Page, Request } from "@playwright/test";

export const SIGNED_OUT_ME: AuthMe = { authenticated: false, handle: null, role: null };
export const SIGNED_IN_OWNER_ME: AuthMe = { authenticated: true, handle: castId<Handle>("owner"), role: "owner" };

/** A fixed view, or a producer called per request (session-flip, slow-read and hit-counting scripts). */
export type AuthMeResponder = AuthMe | ((request: Request) => AuthMe | Promise<AuthMe>);

export async function stubAuthMe(page: Page, view: AuthMeResponder): Promise<void> {
  await page.route("**/api/auth/me", async (route) => {
    const body = typeof view === "function" ? await view(route.request()) : view;
    await route.fulfill({ status: 200, json: body });
  });
}
