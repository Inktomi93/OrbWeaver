import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { Tip, ConfirmDialog } from "#components";

export function Picks({ names }: { readonly names: readonly string[] }): ReactElement {
  return <>{names.map((name) => <Tip key={name} text={`Use ${name}`}><Button aria-label={`Use ${name}`} /></Tip>)}</>;
}

export const unused = ConfirmDialog;
