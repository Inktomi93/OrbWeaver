// The PURPOSE tier's two readings (inference program §5.3a · the step-3b mock `editor.html` Board A): the
// inferred-kind verdict and the task-requirement badge rail. Split out of `connection-editor.tsx` at the
// `component-size` cap; the tier's third row (the background switch) stays with the editor, because it is a
// plain field rather than a derived reading.

import type { DeclaredCapability, ModelKind } from "@orb/contracts/inference";
import { Badge } from "@orb/ui/badge";
import { Check, Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import type { CapabilityBadge } from "../lib/connection-editor-model.ts";
import { KIND_VERDICT_ITEMS, KIND_VERDICT_LABELS } from "../lib/connection-editor-model.ts";

/** The INFERRED-KIND VERDICT — a sentence with an inline change control, never a bare select. A "what is
 *  this model for?" combobox asks the user a question the system already has an opinion about, and the three
 *  options are unguessable before you see the guess. */
export function KindVerdict({
  kind,
  declared,
  busy,
  onChange,
}: {
  readonly kind: ModelKind;
  readonly declared: DeclaredCapability | null;
  readonly busy: boolean;
  readonly onChange: (kind: ModelKind) => void;
}): ReactElement {
  const labelId = useId();
  return (
    <Stack data-slot="connection-kind-verdict" gap="tight">
      <Row align="center" className="flex-wrap" gap="field">
        <Text id={labelId} voice="label">
          This looks like a {KIND_VERDICT_LABELS[kind]} model —
        </Text>
        <Select
          aria-label="Change what this model is for"
          disabled={busy}
          items={KIND_VERDICT_ITEMS.map((item) => ({ label: item.label, value: item.value as string }))}
          onValueChange={(next): void => onChange(String(next) as ModelKind)}
          renderValue={(): ReactNode => "change"}
          value={declared?.kind ?? kind}
        />
      </Row>
      <Text voice="gloss">From the model id and what the server reported. Change it if it's wrong — nothing else on this page depends on the guess.</Text>
    </Stack>
  );
}

/** The task-requirement rail. GREENS FIRST and greens truncate LAST: below the container's `lg` step the
 *  can't-serve badges give way to one summary line, so the rail keeps saying what the connection CAN do.
 *  A can't-serve badge is MUTED with `✗` and its reason — destructive colour is reserved for a BOUND role
 *  that has actually failed, and a chat model that cannot embed is not broken. */
export function CapabilityRail({ badges }: { readonly badges: readonly CapabilityBadge[] }): ReactElement {
  const cannot = badges.filter((badge) => !badge.ok);
  return (
    <Stack data-slot="connection-capability-rail" gap="tight">
      <Row className="flex-wrap" gap="field">
        {badges.map((badge) => (
          <Badge
            className={badge.ok ? undefined : "@max-lg:hidden"}
            intent={badge.ok ? "success" : "neutral"}
            key={badge.task}
            size="sm"
            tone={badge.ok ? "soft" : "ghost"}
          >
            <Icon icon={badge.ok ? Check : X} size="sm" />
            {badge.reason === null ? badge.label : `${badge.label} — ${badge.reason}`}
          </Badge>
        ))}
      </Row>
      {cannot.length === 0 ? null : (
        <Text className="@lg:hidden" voice="gloss">
          …and {String(cannot.length)} more it can't serve.
        </Text>
      )}
    </Stack>
  );
}
