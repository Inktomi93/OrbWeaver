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
