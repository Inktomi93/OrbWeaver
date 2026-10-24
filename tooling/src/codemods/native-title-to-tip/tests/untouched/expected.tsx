import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { EmptyState } from "@orb/ui/empty-state";

export function Kept({ label, reason }: { readonly label: string; readonly reason: string }): ReactElement {
  return (
    <>
      <Button aria-label={label} title={reason} />
      <Badge title="the shape decides how it renders">{label}</Badge>
      <EmptyState title="No stats yet" />
    </>
  );
}
