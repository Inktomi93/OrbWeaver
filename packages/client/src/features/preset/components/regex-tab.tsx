// The Regex tab (BUILD-SPEC §8) — a ListRow list over `regexScripts[i]` (the `regexScriptSchema`: a
// find/replace rule run over prompt/display text) plus an editor Dialog binding `regexScripts[i].*`, whose
// find pattern uses the `@orb/ui/code-editor`. CRUD over the array via `form.pushFieldValue`/
// `removeFieldValue("regexScripts")`.
//
// The LOAD-BEARING merge flip (`mergeOnSubmit` now carries `edited.regexScripts`, preset-editor-model.ts)
// lands in the same phase — without it every edit here is silently discarded on save.

import type { PromptConfig } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import { REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve these glyphs fine (the preset-library-surface.tsx precedent).
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms";
import { RegexEditorDialog } from "./regex-editor-dialog";

type AppForm = AppFormInstance<PromptConfig>;

/** A fresh regex script seeded with the schema defaults (an id so the persisted row is well-formed). */
function makeScript(): RegexScript {
  return {
    id: globalThis.crypto.randomUUID(),
    name: "New script",
    findRegex: "",
    replaceString: "",
    placement: [...REGEX_PLACEMENTS],
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

/** The Regex tab — the script list + the editor Dialog (opened per-row / via Add). */
export function RegexTab({ form }: { readonly form: AppForm }): ReactElement {
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const onAdd = (): void => {
    form.pushFieldValue("regexScripts", makeScript());
    setEditIndex(form.state.values.regexScripts.length);
  };

  return (
    <Section heading="Regex">
      <Text size="micro" tone="muted">
        Find/replace rules run over prompt or display text before it's used.
      </Text>

      <form.Subscribe selector={(state): readonly RegexScript[] => state.values.regexScripts}>
        {(scripts): ReactElement => (
          <Stack gap="field">
            {scripts.length === 0 ? (
              <Text size="micro" tone="muted">
                No scripts yet.
              </Text>
            ) : (
              scripts.map((script, index) => (
                <ListRow
                  // biome-ignore lint/suspicious/noArrayIndexKey: scripts render in array order and are edited in place — the index IS the row identity (the character-greeting-preview precedent).
                  key={index}
                  title={script.name === "" ? "Unnamed script" : script.name}
                  subtitle={script.enabled ? "enabled" : "disabled"}
                  clickable={true}
                  onClick={(): void => setEditIndex(index)}
                  actions={
                    <Button
                      intent="ghost"
                      size="sm"
                      onClick={(): void => {
                        void form.removeFieldValue("regexScripts", index);
                      }}
                    >
                      Remove
                    </Button>
                  }
                />
              ))
            )}
            <Row>
              <Button intent="secondary" size="sm" onClick={onAdd}>
                <Icon icon={Plus} size="sm" />
                Add script
              </Button>
            </Row>
          </Stack>
        )}
      </form.Subscribe>

      {editIndex === null ? null : (
        <RegexEditorDialog form={form} index={editIndex} onClose={(): void => setEditIndex(null)} />
      )}
    </Section>
  );
}
