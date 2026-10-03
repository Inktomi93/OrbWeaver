import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterPicker } from "#components";
import { useTRPC } from "#data";

/** A selected character is read by identity, never searched for in the first library page. */
export function RuleCharacterField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string | undefined;
  readonly onChange: (value: string | undefined) => void;
}): ReactElement {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const id = typeIdSchema(ID_PREFIX.character).safeParse(value);
  const character = useQuery(trpc.character.get.queryOptions(id.success ? { characterId: id.data } : skipToken));
  return (
    <Stack gap="tight">
      <Text>
        {label}: {value === undefined ? "Automatic" : (character.data?.name ?? value)}
      </Text>
      {value !== undefined && character.isError ? (
        <Text voice="gloss">The selected character is unavailable. Its saved identity is retained until you replace it.</Text>
      ) : null}
      <Button intent="ghost" className="justify-start" onClick={(): void => setOpen(!open)}>
        <Icon icon={ChevronRight} size="sm" />
        {open ? "Close character picker" : `Choose ${label.toLowerCase()}`}
      </Button>
      {value === undefined ? null : (
        <Button intent="ghost" className="justify-start" onClick={(): void => onChange(undefined)}>
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
