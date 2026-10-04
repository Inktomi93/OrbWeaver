// `params.logitBias` as rows: each key is a token id or, where the chat connection's server can tokenize, a word
// shown with the tokens it resolves to. The preset stores the words; a turn resolves them on the server through
// the same cache this read fills, so a failed lookup here is a note, never a block.

import type { TokenizeResult, WordTokens } from "@orb/contracts/inference";
import { TOKEN_ID_KEY, TOKENIZE_WORD_CHARS_MAX, TOKENIZE_WORDS_MAX } from "@orb/contracts/inference";
import type { PromptConfig } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Icon, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Text } from "@orb/ui/text";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { KeyboardEvent, ReactElement } from "react";
import { useState } from "react";
import { useTRPC } from "#data";
import type { AppFormInstance } from "#forms/editor";
import { SAMPLING_FLAG_LABELS } from "../lib/sampling-knob-catalog.ts";

type AppForm = AppFormInstance<PromptConfig>;
type Bias = Readonly<Record<string, number>>;

// The OpenAI-family bias scale every local server also takes: -100 bans a token, 100 all but forces it.
const BIAS_MIN = -100;
const BIAS_MAX = 100;
const LEGEND = SAMPLING_FLAG_LABELS.logitBias;
const HINT = "Make words more or less likely: -100 bans a word, 100 almost forces it. Type a word, or a token number if your server can't look words up.";

type Lookup =
  | { readonly state: "pending" }
  | { readonly state: "failed"; readonly reason: string }
  | { readonly state: "done"; readonly result: TokenizeResult };

export function LogitBiasEditor({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <form.AppField name="params.logitBias">
      {(field): ReactElement => (
        <BiasEntries bias={field.state.value} onChange={(next): void => field.handleChange(Object.keys(next).length === 0 ? undefined : { ...next })} />
      )}
    </form.AppField>
  );
}

function BiasEntries({ bias, onChange }: { readonly bias: Bias | undefined; readonly onChange: (next: Bias) => void }): ReactElement {
  const words = wordKeysOf(bias);
  const lookup = useWordLookup(words);
  const [draftKey, setDraftKey] = useState("");
  const [draftBias, setDraftBias] = useState<number | null>(BIAS_MIN);
  const [problem, setProblem] = useState<string | null>(null);
  const entries = Object.entries(bias ?? {});
  // Until the read lands the editor assumes words work; a word added meanwhile shows its lookup failure inline.
  const takesWords = lookup.state !== "done" || lookup.result.available;

  const add = (): void => {
    const refusal = draftRefusal(draftKey, draftBias, { takesWords, words: words.length });
    if (refusal !== null || draftBias === null) {
      setProblem(refusal);
      return;
    }
    onChange({ ...bias, [draftKey]: draftBias });
    setDraftKey("");
    setProblem(null);
  };
  const addOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  };

  return (
    // A group of N entries plus an add row, so a Fieldset names it (the sequence-chips anatomy).
    <Fieldset>
      <Row align="center" gap="tight">
        <FieldsetLegend>{LEGEND}</FieldsetLegend>
        <HintTrigger className="shrink-0" hint={HINT} subject={LEGEND} />
      </Row>
      <Stack gap="tight">
        {entries.map(([key, value]) => (
          <Row align="center" gap="field" key={key}>
            <Badge intent="neutral" size="sm" tone="soft">
              {key}
            </Badge>
            <Text voice="label">{String(value)}</Text>
            <Text voice="gloss">{readoutOf(key, lookup)}</Text>
            <Button
              aria-label={`Remove logit bias ${key}`}
              intent="ghost"
              onClick={(): void => onChange(Object.fromEntries(entries.filter(([other]) => other !== key)))}
              size="icon"
              type="button"
            >
              <Icon icon={X} size="xs" />
            </Button>
          </Row>
        ))}
      </Stack>
      <Row align="center" gap="field">
        <Input
          aria-label={takesWords ? "Word or token number to bias" : "Token number to bias"}
          onChange={(event): void => setDraftKey(event.currentTarget.value)}
          onKeyDown={addOnEnter}
          placeholder={takesWords ? "word or token number" : "token number"}
          value={draftKey}
        />
        <NumberField aria-label="Bias" max={BIAS_MAX} min={BIAS_MIN} onValueChange={(next): void => setDraftBias(next)} value={draftBias} />
        <Button intent="secondary" onClick={add} type="button">
          Add
        </Button>
      </Row>
      {problem === null ? null : (
        <Text role="alert" voice="gloss">
          {problem}
        </Text>
      )}
    </Fieldset>
  );
}

/** Why the draft entry cannot be added, or `null` when it can. */
function draftRefusal(key: string, bias: number | null, held: { readonly takesWords: boolean; readonly words: number }): string | null {
  if (key === "") {
    return "Type a word or token number first.";
  }
  if (!TOKEN_ID_KEY.test(key)) {
    if (!held.takesWords) {
      return "This connection's server can't look words up, so it takes token numbers only.";
    }
    if (key.length > TOKENIZE_WORD_CHARS_MAX) {
      return `A word or phrase is at most ${String(TOKENIZE_WORD_CHARS_MAX)} characters.`;
    }
    if (held.words >= TOKENIZE_WORDS_MAX) {
      return `A preset biases at most ${String(TOKENIZE_WORDS_MAX)} words.`;
    }
  }
  if (bias === null || bias < BIAS_MIN || bias > BIAS_MAX) {
    return `Pick a bias from ${String(BIAS_MIN)} to ${String(BIAS_MAX)}.`;
  }
  return null;
}

/** The bias keys the lookup can ask: words within the route's caps (a stored map past them asks what fits). */
function wordKeysOf(bias: Bias | undefined): string[] {
  return Object.keys(bias ?? {})
    .filter((key) => !TOKEN_ID_KEY.test(key) && key.length <= TOKENIZE_WORD_CHARS_MAX)
    .slice(0, TOKENIZE_WORDS_MAX);
}

/** Each word key's tokens on the chat connection's server. The server answers held words from its cache, so a
 *  new word costs one tokenize call; the previous answer stays on screen while a changed list is asked. */
function useWordLookup(words: string[]): Lookup {
  const trpc = useTRPC();
  const query = useQuery({ ...trpc.connection.tokenizeWords.queryOptions({ words }), placeholderData: keepPreviousData });
  if (query.isError) {
    return { state: "failed", reason: query.error.message };
  }
  return query.data === undefined ? { state: "pending" } : { state: "done", result: query.data };
}

/** What one entry's key reads as beside it: nothing for a token id, the word's tokens or why there are none. */
function readoutOf(key: string, lookup: Lookup): string {
  if (TOKEN_ID_KEY.test(key)) {
    return "";
  }
  if (key.length > TOKENIZE_WORD_CHARS_MAX) {
    return `not looked up: longer than ${String(TOKENIZE_WORD_CHARS_MAX)} characters`;
  }
  if (lookup.state === "pending") {
    return "looking up…";
  }
  if (lookup.state === "failed") {
    return `not looked up: ${lookup.reason}`;
  }
  if (!lookup.result.available) {
    return "skipped: this connection's server can't look words up";
  }
  const answer = lookup.result.words.find((tokens) => tokens.word === key);
  return answer === undefined ? "looking up…" : tokensText(answer);
}

function tokensText(answer: WordTokens): string {
  if (!answer.ok) {
    return `skipped: ${answer.reason}`;
  }
  const shown = answer.pieces?.map((piece, index) => `${JSON.stringify(piece)} ${String(answer.ids[index] ?? "")}`) ?? answer.ids.map(String);
  return `${String(answer.ids.length)} ${answer.ids.length === 1 ? "token" : "tokens"}: ${shown.join(" · ")}`;
}
