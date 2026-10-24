import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { ConfirmDialog } from "#components";

export function Picks({ names }: { readonly names: readonly string[] }): ReactElement {
  return <>{names.map((name) => <Button aria-label={`Use ${name}`} key={name} title={`Use ${name}`} />)}</>;
}

export const unused = ConfirmDialog;
