// The §6.4 regexScripts editor — a `list-row`-per-script + add (DRAFT card content). regexScripts is a
// TanStack Form ARRAY field, so it uses direct `form.Field` (mode="array") for add/remove/read and per-row
// `form.Field` subfields for the edited scalars — NOT a bound macro field (the §6.4 array-field constraint).
// Only the core scalars an author tweaks are surfaced inline (name · find · replace · enabled); the rest of
// each script's options (placement/depth/substitution flags) round-trip untouched from the loaded row.

import type { RegexScript } from "@orb/contracts/regex";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Trash2/Icon fine (the character-card.tsx precedent).
import { Icon, Plus, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";

type CardForm = AppFormInstance<CharacterCardFormValues>;

/** A fresh blank script — a fully-valid `RegexScript` (every schema default made explicit) so a new row
 *  round-trips through the contract without a parse gap. */
function blankRegexScript(): RegexScript {
  return {
    id: globalThis.crypto.randomUUID(),
    name: "New script",
    findRegex: "",
    replaceString: "",
    placement: [],
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: SubstituteFindRegex.none,
    minDepth: null,
    maxDepth: null,
  };
}

export function CharacterRegexScriptsField({ form }: { readonly form: CardForm }): ReactElement {
  return (
    <Section heading="Regex scripts">
      <form.Field name="regexScripts" mode="array">
        {(arrayField): ReactElement => (
          <Stack gap="block">
            {arrayField.state.value.length === 0 ? null : (
              <Stack gap="block">
                {arrayField.state.value.map((script, index) => (
                  <RegexScriptRow
                    key={script.id}
                    form={form}
                    index={index}
                    onRemove={(): void => arrayField.removeValue(index)}
                  />
                ))}
              </Stack>
            )}
            <Button
              type="button"
              size="sm"
              intent="secondary"
              onClick={(): void => arrayField.pushValue(blankRegexScript())}
            >
              <Icon icon={Plus} size="sm" />
              Add script
            </Button>
          </Stack>
        )}
      </form.Field>
    </Section>
  );
}

/** One script row — name/find/replace inputs + an enabled switch + remove. */
function RegexScriptRow({
  form,
  index,
  onRemove,
}: {
  readonly form: CardForm;
  readonly index: number;
  readonly onRemove: () => void;
}): ReactElement {
  return (
    <Stack gap="field" padding="field" className="rounded-card border border-border">
      <Row gap="field" align="center">
        <form.Field name={`regexScripts[${index}].name`}>
          {(field): ReactElement => (
            <Input
              aria-label="Script name"
              className="min-w-0 flex-1"
              value={field.state.value}
              onValueChange={(next): void => field.handleChange(next)}
            />
          )}
        </form.Field>
        <form.Field name={`regexScripts[${index}].enabled`}>
          {(field): ReactElement => (
            <Switch
              aria-label="Enabled"
              checked={field.state.value}
              onCheckedChange={(checked): void => field.handleChange(checked)}
            />
          )}
        </form.Field>
        <Button
          type="button"
          size="icon"
          intent="ghost"
          aria-label="Remove script"
          onClick={onRemove}
        >
          <Icon icon={Trash2} size="sm" />
        </Button>
      </Row>
      <Row gap="field" align="start" className="flex-wrap">
        <form.Field name={`regexScripts[${index}].findRegex`}>
          {(field): ReactElement => (
            <Field label="Find" name={field.name} className="min-w-0 flex-1">
              <Input
                value={field.state.value}
                onValueChange={(next): void => field.handleChange(next)}
              />
            </Field>
          )}
        </form.Field>
        <form.Field name={`regexScripts[${index}].replaceString`}>
          {(field): ReactElement => (
            <Field label="Replace" name={field.name} className="min-w-0 flex-1">
              <Input
                value={field.state.value}
                onValueChange={(next): void => field.handleChange(next)}
              />
            </Field>
          )}
        </form.Field>
      </Row>
    </Stack>
  );
}
