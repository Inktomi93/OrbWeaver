// The "Add document" dialog — all three ingestion paths in ONE shell modal body, with a local mode toggle
// (Upload · Paste · Link) picking the arm through a `Record<AddMode, ModalCommit>` dispatch so a new mode
// fails tsc (§5.5). Two rules the spec files against it:
//
//  · THE UPLOAD CAP IS DERIVED, NEVER A LITERAL (§2.2). A literal byte cap is wrong:
//    the caps catalog is served on `/api/auth/config` and an admin override may TIGHTEN it below the route
//    ceiling. `useUploadCaps().databankUpload` is the live read.
//  · `outcome:'duplicate'` IS SURFACED, NEVER SWALLOWED (§4). The server dedups on `(ownerId, importHash)`
//    and returns the EXISTING document with `ingest:'skipped'`; opening it as if freshly created would make
//    re-adding a file you already had look like a successful import that silently made no new row. Same
//    for `warning:'empty-extraction'` (a scanned image-only PDF): the row's derived `Empty` chip alone
//    reads as a bug, so the moment of creation says it in words.
//
// IT IS A SHELL MODAL SLOT, NOT A LOCALLY-HELD DIALOG: every caller, including one on another section, opens the
// ceremony with `openModal("addDocument")`. This file is the slot's COMMIT: ModalHost owns the overlay, the title,
// the close, the form and the footer, and draws the active arm's submit after Cancel. Each arm is a hook that returns
// its content and its submit, and every arm runs on each render so the hook list is fixed; an arm's input therefore
// survives a mode switch. Landing a document CLOSES the modal and opens that document in the Databank section, from
// wherever the ceremony was started.

import type { DocumentDestination, DocumentScopeSource, IngestOutcome, ScraperKind } from "@orb/contracts/databank";
import { DOCUMENT_SCOPE_SOURCES } from "@orb/contracts/databank";
import { DOC_UPLOAD_ACCEPT, docUploadMime } from "@orb/contracts/extraction";
import type { DocumentId } from "@orb/kit/ids";
import { Field } from "@orb/ui/field";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { useToastManager } from "@orb/ui/toast";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { CharacterPicker } from "#components";
import { DocumentUploadRefusedError, roomRosterOptions, uploadDocument, useGatedQuery, useInvalidation, useTRPC, useUploadCaps } from "#data";
import { focusFirstInvalidFieldIn } from "#forms/editor";
import type { ModalCommit } from "#state";
import { closeModal, selectDocumentFromList, setActiveSection, useActiveChatId } from "#state";
import { AddDocumentArm } from "../components/add-document-arm.tsx";
import { DATABANK_INGEST_GLOSS } from "../lib/databank-copy.ts";
import { DOCUMENT_UPLOAD_FORMAT_HINT } from "../lib/databank-model.ts";
import {
  DATABANK_ADD_METHOD_NAME,
  DATABANK_ADD_NAME,
  DATABANK_ADD_NAME_FIELD_NAME,
  DATABANK_ADD_TEXT_FIELD_NAME,
  DATABANK_ATTACH_GROUP_NAME,
  DATABANK_FROM_LINK_NAME,
  DATABANK_LINK_FIELD_NAME,
  DATABANK_PASTE_TEXT_NAME,
  DATABANK_UPLOAD_FILE_NAME,
  databankChooseFileLabel,
  databankFetchAddLabel,
} from "../lib/databank-names.ts";
import { documentUploadFailureLine } from "../lib/databank-upload-copy.ts";
import type { ScrapeFormValues } from "../lib/scrape-form-model.ts";
import { DEFAULT_CAPTION_LANG, SCRAPE_FAILURE, SCRAPER_OPTIONS } from "../lib/scrape-form-model.ts";
import { useCreateDocumentFromText, useScrapeWeb, useScrapeWiki, useScrapeYoutube } from "./use-databank-mutations.ts";
import { useScrapeForm } from "./use-scrape-form.ts";

/** The dialog's ingestion modes (ONE importable union from a tuple — §5.5). */
const ADD_MODES = ["upload", "paste", "link"] as const;
type AddMode = (typeof ADD_MODES)[number];

const MODE_LABELS: Record<AddMode, string> = { upload: DATABANK_UPLOAD_FILE_NAME, paste: DATABANK_PASTE_TEXT_NAME, link: DATABANK_FROM_LINK_NAME };

// The Link field's form name.
const LINK_FIELD = "url" satisfies keyof ScrapeFormValues;

/** What one arm hands the dialog: its content and the submit the host draws for it. */
type ArmCommit = Pick<ModalCommit, "content" | "submit">;

/** The add-document modal's COMMIT: a three-mode toggle over upload · paste · scrape, with the chosen arm's submit. */
export function useAddDocumentCommit(): ModalCommit {
  const [mode, setMode] = useState<AddMode>("upload");
  const [scope, setScope] = useState<DocumentScopeSource>("global");
  const [character, setCharacter] = useState<Extract<DocumentDestination, { kind: "character" }> | null>(null);
  const trpc = useTRPC();
  const chatId = useActiveChatId();
  const chat = useGatedQuery(chatId, (id) => roomRosterOptions(trpc, { chatId: id }));
  const destinations: Record<DocumentScopeSource, DocumentDestination | null> = {
    global: { kind: "global" },
    character,
    chat: chatId !== null && chat.data?.viewerIsHost === true ? { kind: "chat", chatId } : null,
  };
  const destination = destinations[scope];
  const scopeCopy: Record<DocumentScopeSource, string> = {
    global: "Feeds every chat you are in. Switch off Use in every chat on the document to stop that; any other attachments remain.",
    character: "Feeds chats with the selected character. Existing attachments stay unchanged.",
    chat: destination === null ? "Open a chat you host before choosing This chat." : "Feeds only the current chat. Existing attachments stay unchanged.",
  };
  const toast = useToastManager();

  const landed: OnLanded = ({ id, outcome, ingest, warning }): void => {
    if (outcome === "duplicate") {
      toast.add({ title: "Already in your bank. Destination added.", description: "Its other attachments are unchanged." });
    } else if (ingest === "not-queued") {
      // The half-success, said plainly: the document IS saved, but nothing indexed it, so it will not reach a chat until
      // the user runs the repair the sentence names.
      toast.add({
        title: "Saved, but not indexed yet",
        description: "The indexer wouldn't take the job. The document is safe. Use Rebuild search index on it to try again.",
      });
    } else if (warning === "empty-extraction") {
      toast.add({ title: "Nothing to index in that file", description: "No text could be extracted. A scanned image PDF, most likely." });
    }
    // The ceremony's END, wherever it was started: close the slot, then open what just landed in its own
    // section. A caller on HOME therefore finishes on the new document rather than back where it began
    // with nothing to show for it. (`selectDocumentFromList` + `setActiveSection` are the same two module
    // actions any cross-section navigation uses.)
    selectDocumentFromList(id);
    setActiveSection("databank");
    closeModal();
  };

  const arms: Record<AddMode, ArmCommit> = {
    upload: useUploadArm({ destination, onLanded: landed }),
    paste: usePasteArm({ destination, onLanded: landed }),
    link: useLinkArm({ destination, onLanded: landed, active: mode === "link" }),
  };
  const arm = arms[mode];

  return {
    submit: arm.submit,
    content: (
      <>
        {/* ModalHost draws the title + the close; the teaching gloss is the body's, and it is the ONE spelling
            (databank-copy) every add/empty surface prints. `reading`, NOT `gloss`: this sentence teaches the whole
            mechanism to someone who has never added a document, so it reads at the content voice, paired with the
            reading measure the voice's own doc requires. */}
        <Text cap="prose" voice="reading">
          {DATABANK_INGEST_GLOSS}
        </Text>
        <Stack gap="block">
          <Stack gap="field">
            <Text voice="label">{DATABANK_ATTACH_GROUP_NAME}</Text>
            <ToggleGroup
              aria-label={DATABANK_ATTACH_GROUP_NAME}
              onValueChange={(next): void => {
                const picked = DOCUMENT_SCOPE_SOURCES.find((kind) => kind === next[0]);
                if (picked !== undefined) {
                  setScope(picked);
                }
              }}
              value={[scope]}
            >
              {DOCUMENT_SCOPE_SOURCES.map((kind) => (
                <Toggle variant="outline" key={kind} size="sm" value={kind}>
                  {({ global: "Everywhere", character: "This character", chat: "This chat" } satisfies Record<DocumentScopeSource, string>)[kind]}
                </Toggle>
              ))}
            </ToggleGroup>
            {scope === "character" ? (
              <CharacterPicker
                emptyText="No characters match."
                isSelected={(id): boolean => character?.characterId === id}
                label="Choose a character"
                onSelect={(characterId): void => setCharacter({ kind: "character", characterId })}
                placeholder="Search characters…"
              />
            ) : null}
            <Text cap="prose" prose={true} voice="gloss">
              {scopeCopy[scope]}
            </Text>
          </Stack>
          {/* Three pressable modes, not a tablist: each swaps the body in place with no panel to own or
              label, and `aria-pressed` is the honest name for "this is the one you are on". */}
          <ToggleGroup
            aria-label={DATABANK_ADD_METHOD_NAME}
            onValueChange={(next): void => {
              const picked = ADD_MODES.find((id) => id === next[0]);
              if (picked !== undefined) {
                setMode(picked);
              }
            }}
            value={[mode]}
          >
            {ADD_MODES.map((id) => (
              <Toggle variant="outline" key={id} size="sm" value={id}>
                {MODE_LABELS[id]}
              </Toggle>
            ))}
          </ToggleGroup>
          {/* THE MODE STRIP AND THE FOOTER HOLD ONE Y. The shell's Dialog is vertically centred and the arms differ in
              height, so a swapped region sized by its arm would move the whole dialog under the pointer when the mode
              changes. Each arm reserves the tallest arm's height, a floor rather than a fixed height: an arm that grows (a
              validation line, a revealed field) still grows downward. */}
          {arm.content}
        </Stack>
      </>
    ),
  };
}

/** What every arm reports back: the landed document + how it landed. `ingest` is the DERIVED layer's own
 *  outcome — `not-queued` means the canon was written but its index build was refused, which the user must
 *  hear about (the document is real, and searchable only after a Reindex). */
type OnLanded = (landing: {
  readonly id: DocumentId;
  readonly outcome: "created" | "duplicate";
  readonly ingest: IngestOutcome;
  readonly warning?: "empty-extraction";
}) => void;

interface ArmProps {
  readonly onLanded: OnLanded;
  readonly destination: DocumentDestination | null;
}

// Picking the file IS this arm's commit, so its submit opens the picker the zone also opens, and a drop or a pick uploads at once.
function useUploadArm({ onLanded, destination }: ArmProps): ArmCommit {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const caps = useUploadCaps();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Counts the refusals, so each one hands focus back to the File control the line describes (the Link arm's pattern).
  const [refusals, setRefusals] = useState(0);
  useEffect(() => {
    if (refusals > 0) {
      focusFirstInvalidFieldIn(fieldRef.current);
    }
  }, [refusals]);

  const onFilesSelected = ({ accepted }: FileDropzoneResult): void => {
    // The newest pick owns the line: a refusal left from the last file would read as about this one, and the zone says its own
    // refusal of an unaccepted pick beside it.
    setError(null);
    const file = accepted[0];
    if (file === undefined || destination === null) {
      return;
    }
    setLoading(true);
    uploadDocument(file, undefined, destination).then(
      (result) => {
        // The raw multipart seam has no `createEntityMutation` to hang `invalidates` on — refresh the list
        // AND the bank census through the SAME sanctioned seam by hand (never a bare `invalidateQueries`).
        // Both, because an upload moves a row onto the list and a document onto the count: the producer
        // mutations in `use-databank-mutations` pair the two for the same reason.
        invalidation.invalidateFilters([trpc.databank.list.pathFilter(), trpc.databank.bankHealth.pathFilter()]);
        setSuccess(true);
        onLanded({
          id: result.document.id,
          outcome: result.outcome,
          ingest: result.ingest,
          ...(result.warning === undefined ? {} : { warning: result.warning }),
        });
        setLoading(false);
      },
      (failure: unknown) => {
        // The line is the server's code in the dialog's words; a rejection with no code (an over-size body, a network fault) gets the general line.
        setError(documentUploadFailureLine(failure instanceof DocumentUploadRefusedError ? failure.reason : null));
        setLoading(false);
        setRefusals((count) => count + 1);
      },
    );
  };

  return {
    submit: {
      label: databankChooseFileLabel(loading),
      disabled: destination === null,
      loading,
      onSubmit: (): void => inputRef.current?.click(),
    },
    content: (
      <AddDocumentArm>
        {/* The refusal is the zone's own alert line (`error`), the one home for every refusal the zone says, and `invalid`
            marks the File control so the focus the Link arm's pattern returns to it has a control to find. */}
        <Field description={DOCUMENT_UPLOAD_FORMAT_HINT} invalid={error !== null} label="File" ref={fieldRef}>
          {/* The cap is the DEPLOYMENT's, read live (§2.2) — the dropzone also prints it as its own hint. */}
          <FileDropzone
            accept={DOC_UPLOAD_ACCEPT}
            disabled={destination === null}
            error={error ?? undefined}
            isFileAccepted={(file): boolean => docUploadMime(file.type, file.name) !== undefined}
            loading={loading}
            maxSizeBytes={caps.databankUpload}
            onFilesSelected={onFilesSelected}
            ref={inputRef}
            success={success}
          />
        </Field>
      </AddDocumentArm>
    ),
  };
}

function usePasteArm({ onLanded, destination }: ArmProps): ArmCommit {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateDocumentFromText({ trpc, invalidation });
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  const trimmedName = name.trim();
  const trimmedText = text.trim();

  const onSubmit = (): void => {
    if (destination === null || trimmedName === "" || trimmedText === "") {
      return;
    }
    create.mutate(
      { name: trimmedName, text: trimmedText, destination },
      {
        onSuccess: (result): void => {
          onLanded({
            id: result.document.id,
            outcome: result.outcome,
            ingest: result.ingest,
            ...(result.warning === undefined ? {} : { warning: result.warning }),
          });
        },
      },
    );
  };

  return {
    submit: {
      label: DATABANK_ADD_NAME,
      disabled: destination === null || trimmedName === "" || trimmedText === "",
      loading: create.isPending,
      onSubmit,
    },
    content: (
      <AddDocumentArm>
        <Field label={DATABANK_ADD_NAME_FIELD_NAME}>
          <Input onValueChange={setName} placeholder="e.g. House Valeroth: bloodlines" value={name} />
        </Field>
        <Field label={DATABANK_ADD_TEXT_FIELD_NAME}>
          <Textarea onChange={(event): void => setText(event.target.value)} placeholder="Paste or write the content to index…" rows={8} value={text} />
        </Field>
      </AddDocumentArm>
    ),
  };
}

const LINK_FAILURE_LINE = "the add-document form's fetch failure line";

/** Three fields (source · link · the revealed caption language), so it rides the editor FACTORY rather than
 *  three hand-rolled `useState`s (D54 §13.4): seed, key-remount,
 *  post-submit reset and the reseed guard are the factory's, not this dialog's to re-derive. */
function useLinkArm({ onLanded, destination, active }: ArmProps & { readonly active: boolean }): ArmCommit {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // The arm's line tells a failure only while the link arm is the one on screen. Its hooks run under every mode, so a
  // failure that lands after the person switched source, or closed the dialog, is toasted.
  const failureShownInline = active ? LINK_FAILURE_LINE : undefined;
  const scrapeWeb = useScrapeWeb({ trpc, invalidation, failureShownInline });
  const scrapeYoutube = useScrapeYoutube({ trpc, invalidation, failureShownInline });
  const scrapeWiki = useScrapeWiki({ trpc, invalidation, failureShownInline });

  const pending = scrapeWeb.isPending || scrapeYoutube.isPending || scrapeWiki.isPending;
  // THE FAILURE BELONGS TO A SOURCE, NOT TO THE DIALOG. A flat OR over all three runners would make one runner's error the
  // whole form's error, pointing at a source that had never been tried. A `Record` over the scraper axis, so a new
  // `ScraperKind` fails tsc here instead of silently having no error surface.
  const runnerFailed: Record<ScraperKind, boolean> = {
    web: scrapeWeb.error !== null,
    youtube: scrapeYoutube.error !== null,
    wiki: scrapeWiki.error !== null,
  };

  const save = async (values: ScrapeFormValues): Promise<ScrapeFormValues> => {
    if (destination === null) {
      throw new Error("Choose a document destination.");
    }
    const url = values.url.trim();
    const lang = values.lang.trim() === "" ? DEFAULT_CAPTION_LANG : values.lang.trim();
    // A Record over the scraper axis — a new `ScraperKind` fails tsc rather than silently having no runner.
    const runners: Record<
      ScraperKind,
      () => Promise<{
        readonly document: { readonly id: DocumentId };
        readonly outcome: "created" | "duplicate";
        readonly ingest: IngestOutcome;
      }>
    > = {
      web: () => scrapeWeb.mutateAsync({ url, destination }),
      youtube: () => scrapeYoutube.mutateAsync({ url, lang, destination }),
      wiki: () => scrapeWiki.mutateAsync({ url, destination }),
    };
    const result = await runners[values.source]();
    onLanded({ id: result.document.id, outcome: result.outcome, ingest: result.ingest });
    return values;
  };

  const { form } = useScrapeForm({ entityId: "databank-scrape", serverValues: undefined, save });
  // The submit is drawn by the host, outside this form's subscriptions, so the link's emptiness is mirrored here by its field listener.
  const [urlEmpty, setUrlEmpty] = useState(() => form.state.values.url.trim() === "");
  const failureId = useId();
  const regionRef = useRef<HTMLDivElement | null>(null);
  const linkRef = useRef<HTMLDivElement | null>(null);
  // Counts the fetches that failed, so each one hands focus to the field the failure line describes.
  const [failedFetches, setFailedFetches] = useState(0);
  useEffect(() => {
    if (failedFetches > 0) {
      focusFirstInvalidFieldIn(regionRef.current);
    }
  }, [failedFetches]);
  // This arm shows only when the person chooses it, and in a short viewport its fields start below the mode strip they pressed.
  // `nearest` moves the scroll region only when the Link field is out of view, and the region's scroll padding keeps it above the footer.
  useEffect(() => {
    if (active) {
      linkRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  const onSubmit = (): void => {
    if (destination === null || form.state.values.url.trim() === "") {
      return;
    }
    // A rejected submit is a failed runner, which `runnerFailed` already prints.
    form.handleSubmit().catch(() => setFailedFetches((count) => count + 1));
  };

  return {
    submit: {
      label: databankFetchAddLabel(pending),
      disabled: destination === null || urlEmpty,
      loading: pending,
      onSubmit,
      testKey: "databankScrapeSubmit",
    },
    content: (
      <AddDocumentArm ref={regionRef}>
        <form.AppField name="source">{(field): ReactElement => <field.SelectField items={SCRAPER_OPTIONS} label="Source" />}</form.AppField>
        <Stack ref={linkRef}>
          <form.Subscribe selector={(state): ScraperKind => state.values.source}>
            {(source): ReactElement => (
              <form.AppField listeners={{ onChange: ({ value }): void => setUrlEmpty(value.trim() === "") }} name={LINK_FIELD}>
                {(field): ReactElement => (
                  <field.TextField
                    {...(runnerFailed[source] ? { describedBy: failureId, invalid: true } : {})}
                    label={DATABANK_LINK_FIELD_NAME}
                    placeholder="https://…"
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
        </Stack>
        {/* The caption language is a REVEAL, not a required field: the server defaults it, and it means
            nothing for the other two sources. */}
        <form.Subscribe selector={(state): ScraperKind => state.values.source}>
          {(source): ReactElement | null =>
            source === "youtube" ? (
              <form.AppField name="lang">
                {(field): ReactElement => (
                  <field.TextField
                    description="The caption track to pull, when the video has more than one."
                    label="Caption language"
                    placeholder={DEFAULT_CAPTION_LANG}
                  />
                )}
              </form.AppField>
            ) : null
          }
        </form.Subscribe>
        <form.Subscribe selector={(state): ScraperKind => state.values.source}>
          {(source): ReactElement | null =>
            runnerFailed[source] ? (
              <Text id={failureId} role="alert" tone="destructive" voice="gloss">
                {`${SCRAPE_FAILURE[source]} ${source === "youtube" ? "Check the address and the caption language, then try again." : "Check the address, then try again."}`}
              </Text>
            ) : null
          }
        </form.Subscribe>
      </AddDocumentArm>
    ),
  };
}
