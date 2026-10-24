import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { ConfirmDialog } from "#components";

export function Drop({ name }: { readonly name: string }): ReactElement {
  return <ConfirmDialog trigger={<Button aria-label={`Drop ${name}`} title={`Drop ${name}`} />} />;
}
