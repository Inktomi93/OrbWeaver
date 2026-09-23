// The add dialog's one failure surface: an inline alert directly above the footer, set as reading prose at the
// teaching measure. The dialog states every failure of its submit here — never in a toast, which would sit
// under the modal's scrim and, with the mutation's own toast, say the same thing twice.

import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export function AddConnectionFailure({ sentence }: { readonly sentence: string }): ReactElement {
  return (
    <Row align="start" data-slot="add-connection-failure" gap="field" role="alert">
      <Icon className="shrink-0 text-destructive" icon={AlertTriangle} size="sm" />
      <Text className="max-w-(--reading-measure-prose) text-destructive" prose={true} voice="gloss">
        {sentence}
      </Text>
    </Row>
  );
}
