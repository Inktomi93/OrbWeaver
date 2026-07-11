// The /login route — a thin mount (the route owns chrome-vs-content composition: the auth feature's
// shell ANCHOR wraps its per-mode login SURFACE). The reverse-gate (already-authed → `/`) lives on the
// route definition in router.tsx (`beforeLoad: redirectIfAuthed` — the feature's guard), so this
// component only renders the genuinely-unauthenticated case.

import type { ReactElement } from "react";
import { LoginShellAnchor, LoginSurface } from "#features/auth";

export function LoginPage(): ReactElement {
  return (
    <LoginShellAnchor>
      <LoginSurface />
    </LoginShellAnchor>
  );
}
