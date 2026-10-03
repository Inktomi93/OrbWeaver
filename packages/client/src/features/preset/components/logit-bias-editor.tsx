// `params.logitBias` as rows: each key is a token id or, where the chat connection's server can tokenize, a word
// shown with the tokens it resolves to. The preset stores the words; a turn resolves them on the server through
// the same cache this read fills, so a failed lookup here is a note, never a block.

import type { TokenizeResult, WordTokens } from "@orb/contracts/inference";
import { TOKEN_ID_KEY } from "@orb/contracts/inference";
import type { PromptConfig } from "@orb/contracts/preset";
import { errorMessage } from "@orb/kit/error-message";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Icon, X } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Text } from "@orb/ui/text";
import type { KeyboardEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import type { AppFormInstance } from "#forms/editor";

type AppForm = AppFormInstance<PromptConfig>;
type Bias = Readonly<Record<string, number>>;
type Tokenize = LogitBiasEditorProps["tokenize"];

// The OpenAI-family bias scale every local server also takes: -100 bans a token, 100 all but forces it.
const BIAS_MIN = -100;
const BIAS_MAX = 100;
const LEGEND = "Logit bias";
const HINT =
  "Nudges or blocks specific tokens: -100 bans one, 100 all but forces it. Enter a token id, or a word where the chat connection's server can look words up; each word shows the tokens it becomes.";

type Lookup =
  | { readonly state: "pending" }
  | { readonly state: "failed"; readonly reason: string }
  | { readonly state: "done"; readonly result: TokenizeResult };

const PENDING: Lookup = { state: "pending" };

export interface LogitBiasEditorProps {
  readonly form: AppForm;
  /** Each word's tokens on the chat connection's server (`connection.tokenizeWords`). */
  readonly tokenize: (words: readonly string[]) => Promise<TokenizeResult>;
}

export function LogitBiasEditor({ form, tokenize }: LogitBiasEditorProps): ReactElement {
  return (
    <form.AppField name="params.logitBias">
      {(field): ReactElement => (
        <BiasEntries
          bias={field.state.value}
          onChange={(next): void => field.handleChange(Object.keys(next).length === 0 ? undefined : { ...next })}
          tokenize={tokenize}
        />
      )}
    </form.AppField>
  );
}

function BiasEntries({
  bias,
  onChange,
  tokenize,
}: {
  readonly bias: Bias | undefined;
  readonly onChange: (next: Bias) => void;
  readonly tokenize: Tokenize;
}): ReactElement {
  const lookup = useWordLookup(bias, tokenize);
  const [draftKey, setDraftKey] = useState("");
  const [draftBias, setDraftBias] = useState<number | null>(BIAS_MIN);
  const [problem, setProblem] = useState<string | null>(null);
  const entries = Object.entries(bias ?? {});
  // Until the read lands the editor assumes words work; a word added meanwhile shows its lookup failure inline.
  const takesWords = lookup.state !== "done" || lookup.result.available;

  const add = (): void => {
    const refusal = draftRefusal(draftKey, draftBias, takesWords);
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
          aria-label={takesWords ? "Token id or word to bias" : "Token id to bias"}
          onChange={(event): void => setDraftKey(event.currentTarget.value)}
          onKeyDown={addOnEnter}
          placeholder={takesWords ? "token id or word" : "token id"}
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
function draftRefusal(key: string, bias: number | null, takesWords: boolean): string | null {
  if (key === "") {
    return "Type a token id or a word first.";
  }
  if (!(TOKEN_ID_KEY.test(key) || takesWords)) {
    return "This connection's server can't look words up, so it takes token ids only.";
  }
  if (bias === null || bias < BIAS_MIN || bias > BIAS_MAX) {
    return `Pick a bias from ${String(BIAS_MIN)} to ${String(BIAS_MAX)}.`;
  }
  return null;
}

/** Each word key's tokens on the chat connection's server, asked again whenever the stored map changes; the
 *  server answers held words from its cache, so only a new word costs a tokenize call. An answer is kept with
 *  the map it was asked for, so a newer map reads as pending until its own answer lands. */
function useWordLookup(bias: Bias | undefined, tokenize: Tokenize): Lookup {
  const [answer, setAnswer] = useState<{ readonly bias: Bias | undefined; readonly lookup: Lookup } | null>(null);
  useEffect(() => {
    let live = true;
    const words = Object.keys(bias ?? {}).filter((key) => !TOKEN_ID_KEY.test(key));
    // @orb-waive caught-failure-ownership(tokenize): the rejection becomes the editor's lookup state, shown beside each word as "not looked up: <reason>"; the turn resolves words on the server regardless. Ends if this read moves to a query.
    tokenize(words).then(
      (result) => {
        if (live) {
          setAnswer({ bias, lookup: { state: "done", result } });
        }
      },
      (err: unknown) => {
        if (live) {
          setAnswer({ bias, lookup: { state: "failed", reason: errorMessage(err) } });
        }
      },
    );
    return (): void => {
      live = false;
    };
  }, [bias, tokenize]);
  return answer !== null && answer.bias === bias ? answer.lookup : PENDING;
}

/** What one entry's key reads as beside it: nothing for a token id, the word's tokens or why there are none. */
function readoutOf(key: string, lookup: Lookup): string {
  if (TOKEN_ID_KEY.test(key)) {
    return "";
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
