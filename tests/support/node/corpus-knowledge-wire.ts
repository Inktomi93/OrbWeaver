// Physical prose and finite swipe replies only; memory parsing, tier math and generation stay in production.

import { corpusKnowledgeText } from "./corpus-knowledge.ts";
import type { CorpusProviderCompletion } from "./corpus-provider.ts";

export const CORPUS_KNOWLEDGE_SWIPE_CUE = "Show the knowledge corpus signal.";
export const CORPUS_KNOWLEDGE_SWIPE_TAKES = [
  "The traveller hears the first orbital signal.",
  "The traveller finds the second signal beside the loom.",
  "The traveller answers the third signal from the harbor.",
] as const;
const CONSOLIDATION_LEAD = "Prior digests to consolidate";

/** Supply a body-bearing arc to the real consolidator without encoding any grouping or tier rule. */
export function corpusKnowledgeVariantsText(body: string): string {
  if (body.includes(CONSOLIDATION_LEAD)) {
    return "The orbital ledger arc\nThe keeper repaired the loom and preserved the harbor witnesses across their journey.\nKeywords: loom, harbor, witnesses";
  }
  return corpusKnowledgeText(body);
}

interface KnowledgeSwipeWire {
  readonly completion: (body: string) => CorpusProviderCompletion | undefined;
  readonly requests: readonly string[];
  readonly remaining: () => number;
}

/** The actual generation request must spend one supplied take; summarization and structured traffic delegate. */
export function createKnowledgeSwipeWire(): KnowledgeSwipeWire {
  const requests: string[] = [];
  let cursor = 0;
  return {
    requests,
    remaining: (): number => CORPUS_KNOWLEDGE_SWIPE_TAKES.length - cursor,
    completion: (body): CorpusProviderCompletion | undefined => {
      if (
        !body.includes(CORPUS_KNOWLEDGE_SWIPE_CUE) ||
        body.includes("Transcript block:") ||
        body.includes(CONSOLIDATION_LEAD) ||
        body.includes('"response_format":')
      ) {
        return undefined;
      }
      const text = CORPUS_KNOWLEDGE_SWIPE_TAKES[cursor];
      if (text === undefined) {
        throw new Error("exhausted knowledge corpus swipe replies");
      }
      cursor += 1;
      requests.push(body);
      return { text, toolCalls: [] };
    },
  };
}
