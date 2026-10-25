// The add dialog's one failure surface: an inline alert directly above the footer, set as reading prose at the
// teaching measure. The dialog states every failure of its submit here — never in a toast, which would sit
// under the modal's scrim and, with the mutation's own toast, say the same thing twice. It is focusable by
// script only (`tabIndex={-1}`): the dialog moves focus here when a failure appears.

import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, Ref } from "react";

export function AddConnectionFailure({ sentence, ref }: { readonly sentence: string; readonly ref: Ref<HTMLDivElement> }): ReactElement {
  return (
    <Row align="start" data-slot="add-connection-failure" gap="field" ref={ref} role="alert" tabIndex={-1}>
      <Icon className="shrink-0" icon={AlertTriangle} size="sm" tone="destructive" />
      <Text tone="destructive" className="max-inline-(--reading-measure-prose)" prose={true} voice="gloss">
        {sentence}
      </Text>
    </Row>
  );
}
