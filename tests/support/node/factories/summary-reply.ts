// The summarizer's reply as the digest parser reads it: the first line is the topic anchor, the lines between it and the
// last `Keywords:` marker are the facts, and the comma-split list after the marker is the keywords.

export interface SummaryReplyParts {
  readonly anchor: string;
  readonly facts: string;
  readonly keywords: readonly string[];
}

export function summaryReply({ anchor, facts, keywords }: SummaryReplyParts): string {
  return `${anchor}\n${facts}\nKeywords: ${keywords.join(", ")}`;
}
