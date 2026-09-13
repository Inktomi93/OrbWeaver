// The GraphQL documents. Every one is NAMED (`WorkItem*`) because the operation name is how the fake-gh
// harness dispatches and how a quota question ("which call burned the budget?") is answered from the
// call log. Targeted walks only — nothing here enumerates the project except the explicit list query.

const FIELD_VALUE_FRAGMENTS = `
            ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
            ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }`;

export const CONTEXT_QUERY = `query WorkItemContext($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      id number title url state body
      comments(last: 100) { nodes { body } }
      blockedBy(first: 100) { nodes { number state } }
      projectItems(first: 10) {
        nodes {
          id
          project { id number }
          fieldValues(first: 50) { nodes {${FIELD_VALUE_FRAGMENTS}
          } }
        }
      }
    }
  }
}`;

export const PROJECT_QUERY = `query WorkItemProject($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) {
      id
      fields(first: 50) {
        nodes {
          __typename
          ... on ProjectV2FieldCommon { id name }
          ... on ProjectV2SingleSelectField { options { id name } }
        }
      }
    }
  }
}`;

export const LIST_QUERY = `query WorkItemList($project: ID!, $cursor: String) {
  node(id: $project) {
    ... on ProjectV2 {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          content { ... on Issue { number title url } ... on PullRequest { number title url } ... on DraftIssue { title } }
          fieldValues(first: 50) { nodes {${FIELD_VALUE_FRAGMENTS}
          } }
        }
      }
    }
  }
}`;

export const ADD_QUERY = `mutation WorkItemAdd($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
}`;

export const BLOCKERS_QUERY = `query WorkItemBlockers($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) { issue(number: $number) { blockedBy(first: 100) { nodes { number state } } } }
}`;

export const ISSUE_ID_QUERY = `query WorkItemIssueId($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) { issue(number: $number) { id } }
}`;

export function dependencyMutation(remove: boolean): string {
  const mutation = remove ? "removeBlockedBy" : "addBlockedBy";
  return `mutation WorkItemDependency($issueId: ID!, $blockingIssueId: ID!) { ${mutation}(input: { issueId: $issueId, blockingIssueId: $blockingIssueId }) { issue { id } } }`;
}

/** EVERY issue's number, state, SUBJECT and board membership, paged — the BULK door (#2156). The targeted
 *  walks above answer one row richly; a citation census asks about hundreds of numbers at once and would
 *  otherwise spend hundreds of calls (and the reviewer's patience) to learn one enum per row.
 *
 *  WHY IT IS NOT THE THINNEST SELECTION ANY MORE (codex review F1, 2026-09-13). `number state` alone can
 *  only answer "does this id resolve"; #2156's filed contract is that the cited row NAMES the ledger row's
 *  subject, and its founding defect (#2153) crossed two ids that BOTH existed. Answering that needs the
 *  row's own text, so `title body` come back with it and the join is `lib/citation-subject.ts`. The
 *  `projectItems` slice answers the other half of "a BOARD row": an issue on no board is not one.
 *  Measured 2026-09-13: 2328 issues over 24 pages, ~125 KB and ~1 s per page. `first: 10` on projectItems
 *  is the fence — an issue is on Project 1 or it is not, and a truncated list would silently read
 *  "off-board", which the snapshot-level membership assertion in `fetchIssueStates` refuses. */
export const ISSUE_STATES_QUERY = `query WorkItemIssueStates($owner: String!, $repo: String!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    issues(first: 100, after: $cursor, orderBy: { field: CREATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes { number state title body projectItems(first: 10) { nodes { project { number } } } }
    }
  }
}`;
