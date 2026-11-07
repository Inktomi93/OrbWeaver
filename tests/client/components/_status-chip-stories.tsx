import type { StatusVocabulary } from "@orb/client/components";
import { StatusChip } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import type { ReactElement } from "react";

const VOCABULARY: StatusVocabulary<"up" | "off"> = { up: { label: "Sharing", tone: "success" }, off: { label: "Not sharing", tone: "neutral" } };

/** One colour member and the neutral one, which the pill paints as a tint. */
export function StatusChipStory(): ReactElement {
  return (
    <CtIsolation subject="StatusChip" isolates="The chip's reading of a vocabulary, with no feature around it">
      <StatusChip status="up" vocabulary={VOCABULARY} />
      <StatusChip status="off" vocabulary={VOCABULARY} />
    </CtIsolation>
  );
}
