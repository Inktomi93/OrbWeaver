// A status chip reads its tone and its word from one vocabulary keyed by the status union, so a new member fails to compile
// until it has both, and a wire spelling never paints. Only a chip whose words a person authored outside the union stays a raw Badge.

import { Badge, STATUS_PILL_VARIANT } from "@orb/ui/badge";
import type { ComponentProps, ReactElement } from "react";

interface StatusEntry {
  readonly label: string;
  readonly tone: keyof typeof STATUS_PILL_VARIANT;
}

/** The tone and word of every member of a status union. */
export type StatusVocabulary<S extends string> = Readonly<Record<S, StatusEntry>>;

interface StatusChipProps<S extends string> {
  readonly vocabulary: StatusVocabulary<S>;
  /** Inference reads the vocabulary alone, so a bare `string` cannot widen the union. */
  readonly status: NoInfer<S>;
  readonly size?: ComponentProps<typeof Badge>["size"];
}

/** The filled status pill for one member of a status union. */
export function StatusChip<S extends string>({ vocabulary, status, size }: StatusChipProps<S>): ReactElement {
  const { label, tone } = vocabulary[status];
  return (
    <Badge size={size} tone={tone} variant={STATUS_PILL_VARIANT[tone]}>
      {label}
    </Badge>
  );
}
