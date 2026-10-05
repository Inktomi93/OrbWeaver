// The root-owned toast overlay survives route and crash-boundary changes without reflowing content.

import { Toaster } from "@orb/ui/toast";
import type { ReactElement } from "react";

export function AppToaster(): ReactElement {
  return <Toaster />;
}
