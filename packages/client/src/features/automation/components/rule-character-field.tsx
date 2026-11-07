import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterPicker, QueryBoundary } from "#components";
import { SkeletonRows, useSuspenseQuery, useTRPC } from "#data";

/** A selected character is read by identity, never searched for in the first library page. */
export function RuleCharacterField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: CharacterId | undefined;
  readonly onChange: (value: CharacterId | undefined) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="tight">
      {value === undefined ? (
        <Text>{label}: Automatic</Text>
      ) : (
        <QueryBoundary
          resetKeys={[value]}
          fallback={<SkeletonRows count={1} shape="line" />}
          renderError={(_error, retry): ReactElement => (
            <Stack gap="tight">
              <Text>
                {label}: {value}
              </Text>
              <Text voice="gloss">The selected character is unavailable. Its saved identity is retained until you replace it.</Text>
              <Button variant="ghost" justify="start" onClick={retry}>
                Retry
              </Button>
            </Stack>
          )}
        >
          <SelectedCharacterName characterId={value} label={label} />
        </QueryBoundary>
      )}
      <Button variant="ghost" justify="start" onClick={(): void => setOpen(!open)}>
        <Icon icon={ChevronRight} size="sm" />
        {open ? "Close character picker" : `Choose ${label.toLowerCase()}`}
      </Button>
      {value === undefined ? null : (
        <Button variant="ghost" justify="start" onClick={(): void => onChange(undefined)}>
          Use automatic {label.toLowerCase()}
        </Button>
      )}
      {open ? (
        <CharacterPicker
          label={`Choose ${label.toLowerCase()}`}
          placeholder="Search characters…"
          emptyText="No characters found."
          onSelect={(selected): void => {
            onChange(selected);
            setOpen(false);
          }}
          reserveKey="automation.rule.character"
        />
      ) : null}
    </Stack>
  );
}

function SelectedCharacterName({ characterId, label }: { readonly characterId: CharacterId; readonly label: string }): ReactElement {
  const trpc = useTRPC();
  const { data: character } = useSuspenseQuery(trpc.character.get.queryOptions({ characterId }));
  return (
    <Text>
      {label}: {character.name}
    </Text>
  );
}
