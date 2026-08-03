// The GM console's GAME MACROS section (WAVE MU, owner ruling #20's game half) — the host authors macros that
// live with THIS game: they resolve in its turns, appear in the Macro picks pane glossed "from game", and
// leave when the game does. The preset is the other authoring home; this is not a copy of it, it is the
// game-scoped one (a game's vocabulary — {{scene_tone}}, {{house_rule}} — has no business in a preset the host
// runs everywhere).
//
// ANATOMY REUSE, not a fork: the list + editor Dialog is the SAME `EntryListEditor` + `UserMacroEditorDialog`
// pair the preset's Macros tab mounts (extracted to `#components` for this second home — a features/rpg →
// features/preset import would be a sideways import, and a twin editor would drift from the ONE
// `UserMacroSpec` schema both write).
//
// PERSISTENCE: the autosave boundary (D66 A4 — no Save buttons anywhere in this panel), saving through the ONE
// config door. `updateConfig({patch:{userMacros}})` is a WHOLE-LIST replace (the `trackers` semantics), so the
// form's whole array is the payload on every write — including the remove arm, which sends the list without
// the row. Its own boundary (not folded into the scalar form) because it owns a structural ARRAY: the store
// driver persists `pushFieldValue`/`removeFieldValue` (D78 §3), and the scalar bag has no business riding a
// macro keystroke.
//
// SHADOW GLOSS: a game macro whose name matches one the active preset declares WINS at turn time
// (`shadowPresetUserMacros` — the server's one home for the rule). That is a real consequence the host cannot
// otherwise see, so the row says so quietly. The preset names come off the host-gated config view
// (`presetMacroNames`), never re-derived here.

import type { UserMacroSpec } from "@orb/contracts/preset";
import { userMacroSchema } from "@orb/contracts/preset";
import type { RpgConfigView } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import type { UserMacrosFormValues } from "#components";
import { EntryListEditor, UserMacroEditorDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm } from "#forms";
import { withUserMacros } from "#lib";
import { useUpdateConfig } from "../hooks/use-rpg-mutations.ts";

// The autosave macro-list form. Module scope (stable identity — the D54 §13.1 factory pattern); keyed by the
// chatId so switching chats with the Game tab open is a full remount seeded from the new game's macros.
const GameMacrosFormBoundary = createAutosaveEntityForm<UserMacrosFormValues>({ defaultValues: { userMacros: [] } });

export interface RpgGameMacrosProps {
  readonly chatId: ChatId;
  readonly config: RpgConfigView;
}

/** The game's authored user macros — list + the shared editor Dialog, autosaved through `updateConfig`. */
export function RpgGameMacros({ chatId, config }: RpgGameMacrosProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const save = (values: UserMacrosFormValues): Promise<unknown> => updateConfig.mutateAsync({ chatId, patch: { userMacros: values.userMacros } });
  return (
    <GameMacrosFormBoundary entityId={`rpg-game-macros:${chatId}`} serverValues={{ userMacros: [...config.userMacros] }} save={save}>
      {(session): ReactElement => <GameMacrosBody session={session} presetMacroNames={config.presetMacroNames} />}
    </GameMacrosFormBoundary>
  );
}

/** The form-bound body — the session's form is the array's owner; the boundary persists every structural op. */
function GameMacrosBody({
  session,
  presetMacroNames,
}: {
  readonly session: AutosaveSession<UserMacrosFormValues>;
  readonly presetMacroNames: readonly string[];
}): ReactElement {
  const { form } = session;
  // The open editor targets a macro INDEX (`null` = closed). Add pushes then opens the new tail.
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const shadowed = new Set(presetMacroNames);

  const onAdd = (): void => {
    // Capture the PRE-push length (pushFieldValue applies synchronously — the Variables-tab off-by-one).
    const newIndex = form.state.values.userMacros.length;
    // Minted THROUGH the schema (the preset tab's Add does the same) — every other field is a schema default.
    form.pushFieldValue("userMacros", userMacroSchema.parse({ name: "new_macro", body: "" }));
    setEditIndex(newIndex);
  };

  return (
    <Stack gap="field" data-slot="rpg-game-macros">
      <form.Subscribe selector={(state): readonly UserMacroSpec[] => state.values.userMacros}>
        {(userMacros): ReactElement => (
          <EntryListEditor
            addLabel="Add macro"
            editIndex={editIndex}
            // An empty list must say what empty MEANS here ([[empty-states-are-load-bearing]]): the feature
            // exists, this game just hasn't defined one — not "macros are unavailable".
            emptyText="No game macros yet — the ones you add here live with this game and leave with it."
            // The SHADOW gloss rides the row it is about (a separate block would make the host match names by
            // eye): the collision is stated as the consequence it is — the game def is what the turn
            // resolves — never as a warning, because shadowing is a legitimate move.
            getSubtitle={(macro): string =>
              shadowed.has(macro.name)
                ? `Overrides preset — while this game runs, this definition is the one that resolves.${macro.description === "" ? "" : ` ${macro.description}`}`
                : macro.description
            }
            getTitle={(macro): string => (macro.name === "" ? "Unnamed macro" : `{{${macro.name}}}`)}
            heading="Game macros"
            helperText="Template macros scoped to THIS game — usable anywhere macros resolve while it runs, and offered in Macro picks. Your preset's macros keep working alongside them."
            items={userMacros}
            onAdd={onAdd}
            onEdit={setEditIndex}
            onRemove={(index): void => {
              void form.removeFieldValue("userMacros", index);
            }}
            renderEditor={(index): ReactElement => (
              <UserMacroEditorDialog
                form={form}
                index={index}
                onClose={(): void => setEditIndex(null)}
                // BOTH planes, in the resolver's precedence (game defs first — `withUserMacros` registers
                // them first, so a shadowed preset name never reaches the popover as a second row). The
                // preset half is NAMES only by the least-privilege view: those rows say where they come
                // from and nothing they cannot know.
                suggestions={withUserMacros(userMacros, presetMacroNames)}
              />
            )}
          />
        )}
      </form.Subscribe>
    </Stack>
  );
}
