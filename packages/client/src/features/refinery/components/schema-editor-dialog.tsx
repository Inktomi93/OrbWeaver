// The custom-schema EDITOR (R3/SF — the NL design §4.7): the describe-in-English door. One dialog, four
// coupled panes: the NL panel (describe → Generate → Refine-instruction → iterate), the schema itself
// (raw JSON — the secondary door; the lift refusal surfaces VERBATIM with construct + path), the LIVE
// RENDER PREVIEW (the SAME `buildRenderPlan`+`PayloadView` every run renders through — a custom schema
// that previews poorly is a renderer defect, which is exactly the honesty loop the owner asked for), and
// the test drill (pick an owned card → `testSchema` → the real model payload through the same preview).
//
// The generator's `failed` arm renders the RAW reply into the JSON pane for hand-fixing (the
// show-the-partial policy — errors-as-data, never a toast that eats the draft).

import type { RefinerySchemaStage } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySchemaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Field } from "@orb/ui/field";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement, RefObject } from "react";
import { useRef, useState } from "react";
import { CharacterPicker, FormDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import {
  useCreateRefinerySchema,
  useGenerateRefinerySchema,
  useRefineRefinerySchema,
  useTestRefinerySchema,
  useUpdateRefinerySchema,
} from "../hooks/use-refinery-schemas.ts";
import { buildRenderPlan } from "../lib/render-plan.ts";
import { PayloadView } from "./payload-view.tsx";
import { RefineryChip } from "./refinery-chip.tsx";

export interface SchemaEditorDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly stage: RefinerySchemaStage;
  /** Editing an existing row, or null = authoring a new one. */
  readonly editing: { readonly id: RefinerySchemaId; readonly name: string; readonly description: string; readonly schema: Record<string, unknown> } | null;
  /** Fired with the saved row's id so the caller can point the session at it. */
  readonly onSaved: (schemaId: RefinerySchemaId) => void;
}

const STAGE_WORD: Record<RefinerySchemaStage, string> = { score: "score", analyze: "analyze" };

function dialogTitleOf(editing: SchemaEditorDialogProps["editing"], stage: RefinerySchemaStage): string {
  return editing === null ? `New ${STAGE_WORD[stage]} schema` : `Edit "${editing.name}"`;
}

/** The no-preview arm's copy: an empty pane invites, a broken one teaches. */
function previewEmptyTextOf(schemaText: string): string {
  return schemaText.trim().length === 0 ? "Generate a draft, or paste a schema to preview it." : "That JSON doesn't parse yet — fix it to preview.";
}

function parseDraft(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A save refusal, verbatim (the lift belt's construct + path text IS the teaching surface). */
function RefusalNote({ error }: { error: unknown }): ReactElement | null {
  if (error === null || error === undefined) {
    return null;
  }
  return (
    <Text data-testid={testId("refinerySchemaRefusal")} voice="gloss">
      {String((error as { message?: string }).message ?? "That schema was refused.")}
    </Text>
  );
}

/** The live render preview + the test drill — remounted per draft (`key={schemaText}` at the caller),
 *  so a fresh draft always opens with an empty test payload. */
function PreviewCard({
  plan,
  schema,
  stage,
  outerBusy,
}: {
  plan: ReturnType<typeof buildRenderPlan>;
  schema: Record<string, unknown>;
  stage: RefinerySchemaStage;
  outerBusy: boolean;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const testSchema = useTestRefinerySchema({ trpc, invalidation });
  const [testCharacterId, setTestCharacterId] = useState<CharacterId | null>(null);
  const [testPayload, setTestPayload] = useState<Record<string, unknown> | null>(null);
  return (
    <Card>
      <Stack gap="row" padding="block">
        <Row align="center" gap="field">
          <Text voice="kicker">Render preview</Text>
          <RefineryChip tone="info">the same renderer every run uses</RefineryChip>
        </Row>
        <PayloadView payload={testPayload ?? {}} plan={plan} />
        <Row align="center" gap="field">
          <CharacterPicker
            emptyText="No characters match."
            label="Test the schema on a card"
            onSelect={(id): void => setTestCharacterId(id)}
            placeholder="Search characters…"
          />
          <Button
            disabled={outerBusy || testSchema.isPending || testCharacterId === null}
            intent="secondary"
            onClick={(): void => {
              if (testCharacterId !== null) {
                testSchema.mutate({ schema, stage, characterId: testCharacterId }, { onSuccess: (payload): void => setTestPayload(payload) });
              }
            }}
            size="sm"
          >
            Test on this card
          </Button>
        </Row>
      </Stack>
    </Card>
  );
}

interface SaveDeps {
  readonly editing: SchemaEditorDialogProps["editing"];
  readonly description: string;
  readonly stage: RefinerySchemaStage;
  readonly create: ReturnType<typeof useCreateRefinerySchema>;
  readonly update: ReturnType<typeof useUpdateRefinerySchema>;
  readonly onSaved: (schemaId: RefinerySchemaId) => void;
  readonly onOpenChange: (open: boolean) => void;
}

/** The save press: create-or-update against the library, closing on success (the refusal renders
 *  in-dialog via `RefusalNote` — errors-as-data, never a lost draft). */
function saveDraft(name: string, schema: Record<string, unknown> | null, deps: SaveDeps): void {
  const { editing, description, stage, create, update, onSaved, onOpenChange } = deps;
  if (schema === null || name.length === 0) {
    return;
  }
  const onSuccess = (row: { id: RefinerySchemaId }): void => {
    onSaved(row.id);
    onOpenChange(false);
  };
  if (editing === null) {
    create.mutate({ name, description, stage, schema }, { onSuccess });
    return;
  }
  update.mutate({ schemaId: editing.id, patch: { name, description, schema } }, { onSuccess });
}

type ForgeResult = { kind: "draft"; name: string; schema: Record<string, unknown> } | { kind: "failed"; message: string; raw: string | null };

interface DraftSetters {
  readonly nameRef: RefObject<HTMLTextAreaElement | null>;
  readonly setNameFilled: (filled: boolean) => void;
  readonly setSchemaText: (text: string) => void;
  readonly setForgeNote: (note: string | null) => void;
}

/** Land a forge turn's result: a draft fills the panes (and a still-blank name), a failure renders the
 *  RAW reply into the JSON pane for hand-fixing (show-the-partial — never a toast that eats the draft).
 *  Runs at EVENT time only (mutation onSuccess), so the ref read is legal. */
function applyForgeResult(result: ForgeResult, { nameRef, setNameFilled, setSchemaText, setForgeNote }: DraftSetters): void {
  if (result.kind === "draft") {
    if (nameRef.current !== null && nameRef.current.value.trim().length === 0) {
      nameRef.current.value = result.name;
      setNameFilled(true);
    }
    setSchemaText(JSON.stringify(result.schema, null, 2));
    setForgeNote(null);
    return;
  }
  setForgeNote(result.message);
  if (result.raw !== null) {
    setSchemaText(result.raw);
  }
}

/** The conversational-iteration row (§4.5 loop) — instruction in, `refineSchema` turn out. Only rendered
 *  once a parseable draft exists. */
function RefineRow({
  schema,
  stage,
  busy,
  instructionRef,
  refine,
  onLand,
}: {
  schema: Record<string, unknown>;
  stage: RefinerySchemaStage;
  busy: boolean;
  instructionRef: RefObject<HTMLTextAreaElement | null>;
  refine: ReturnType<typeof useRefineRefinerySchema>;
  onLand: (result: ForgeResult) => void;
}): ReactElement {
  return (
    <>
      <Field className="min-w-0 flex-1" label="Refine the draft">
        <Textarea defaultValue="" placeholder='e.g. "add a per-issue severity enum"' ref={instructionRef} rows={1} />
      </Field>
      <Button
        disabled={busy}
        intent="secondary"
        onClick={(): void => {
          const instruction = instructionRef.current?.value.trim() ?? "";
          if (instruction.length > 0) {
            refine.mutate({ schema, instruction, stage }, { onSuccess: onLand });
          }
        }}
        size="sm"
      >
        Refine
      </Button>
    </>
  );
}

export function SchemaEditorDialog({ open, onOpenChange, stage, editing, onSaved }: SchemaEditorDialogProps): ReactElement {
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const [nameFilled, setNameFilled] = useState(editing !== null && editing.name.length > 0);
  const [description, setDescription] = useState(editing === null ? "" : editing.description);
  const [schemaText, setSchemaText] = useState(editing === null ? "" : JSON.stringify(editing.schema, null, 2));
  const [forgeNote, setForgeNote] = useState<string | null>(null);

  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const deps = { trpc, invalidation };
  const generate = useGenerateRefinerySchema(deps);
  const refine = useRefineRefinerySchema(deps);
  const create = useCreateRefinerySchema(deps);
  const update = useUpdateRefinerySchema(deps);

  const schema = parseDraft(schemaText);
  // The live preview: the SAME plan derivation every run renders through, over an EMPTY payload (the
  // designed empty arms show the anatomy — hero gauge, chips, prose slots — before any model ran).
  const previewPlan = schema === null ? null : buildRenderPlan(schema);
  // A function declaration, not a render-time factory call: the ref is only READ inside the event-time
  // body (the react-hooks refs-during-render ban).
  function landDraft(result: ForgeResult): void {
    applyForgeResult(result, { nameRef, setNameFilled, setSchemaText, setForgeNote });
  }
  const busy = generate.isPending || refine.isPending;

  return (
    <FormDialog onOpenChange={onOpenChange} open={open} size="lg" title={dialogTitleOf(editing, stage)}>
      <Stack gap="row">
        <Text voice="gloss">
          Describe the structure you want in plain English — the generator stays inside the schema vocabulary the wire enforces, and hints it emits make the
          result render as gauges, chips and prose instead of fields. Bounds are checked after the model replies; on a local model they are grammar-enforced.
        </Text>
        <Field label="Describe the structure">
          <Textarea
            onChange={(e): void => setDescription(e.target.value)}
            placeholder='e.g. "rating 1-10, a mood enum, list of issues, one-paragraph summary"'
            rows={2}
            value={description}
          />
        </Field>
        <Row gap="field">
          <Button
            disabled={busy || description.trim().length === 0}
            onClick={(): void => {
              generate.mutate({ description, stage }, { onSuccess: landDraft });
            }}
            size="sm"
          >
            Generate
          </Button>
          {schema !== null ? <RefineRow busy={busy} instructionRef={instructionRef} onLand={landDraft} refine={refine} schema={schema} stage={stage} /> : null}
        </Row>
        {forgeNote !== null ? (
          <Text data-testid={testId("refineryForgeNote")} voice="gloss">
            {forgeNote}
          </Text>
        ) : null}
        <Field label="Schema (JSON — the raw door)">
          <Textarea onChange={(e): void => setSchemaText(e.target.value)} rows={8} value={schemaText} />
        </Field>
        <RefusalNote error={editing === null ? create.error : update.error} />
        {previewPlan !== null && schema !== null ? (
          <PreviewCard key={schemaText} outerBusy={busy} plan={previewPlan} schema={schema} stage={stage} />
        ) : (
          <Text voice="gloss">{previewEmptyTextOf(schemaText)}</Text>
        )}
        <Row gap="row" justify="end">
          <Field label="Name">
            <Textarea
              defaultValue={editing === null ? "" : editing.name}
              onInput={(e): void => setNameFilled(e.currentTarget.value.trim().length > 0)}
              ref={nameRef}
              rows={1}
            />
          </Field>
          <Button
            disabled={busy || schema === null || !nameFilled}
            onClick={(): void => saveDraft(nameRef.current?.value.trim() ?? "", schema, { editing, description, stage, create, update, onSaved, onOpenChange })}
            size="sm"
          >
            {editing === null ? "Save schema" : "Save changes"}
          </Button>
        </Row>
      </Stack>
    </FormDialog>
  );
}
