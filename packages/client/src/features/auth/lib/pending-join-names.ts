// The accessible names and texts the sign-in page prints around an invite: the pending-join panel, the signed-out signup
// arm and the unavailable state. A zero-import leaf, so a spec's node side reads them without loading the component graph.

/** The dismiss of every invite arm. */
export const PENDING_JOIN_NOT_NOW_NAME = "Not now";

/** The sign-in card's heading and its local form's name; the invite arm's heading once an account exists. */
export const SIGN_IN_NAME = "Sign in";
export const SIGN_IN_TO_JOIN_NAME = "Sign in to join";

/** The local form's submit, by whether the sign-in is in flight. */
export function signInLabel(signingIn: boolean): string {
  return signingIn ? "Signing in…" : SIGN_IN_NAME;
}

/** The OIDC arm's press that leaves for the identity provider named `providerName`. */
export function continueWithName(providerName: string): string {
  return `Continue with ${providerName}`;
}

/** The way back to the sign-in card from an invite arm that has no room to show. */
export const BACK_TO_SIGN_IN_NAME = "Back to sign in";

/** The room preview's heading, its pending read, and the state of an invite that admits no one. */
export const INVITED_HEADING = "You're invited";
export const INVITE_LOADING_NAME = "Loading your invite";
export const INVITE_UNAVAILABLE_TITLE = "This invite isn't available";

/** The signup arm's presses: the submit and the door to an existing account. */
export const JOIN_CREATE_ACCOUNT_NAME = "Create account and join";
export const JOIN_HAVE_ACCOUNT_NAME = "I already have an account";

/** The signup form's submit, by whether the account is being created. */
export function signupSubmitLabel(creating: boolean): string {
  return creating ? "Creating your account…" : JOIN_CREATE_ACCOUNT_NAME;
}

/** The pending-join confirm's name while the confirm is in flight. */
export const JOIN_CONFIRMING_NAME = "Joining…";

/** The pending-join confirm, by whether the confirm is in flight. */
export function pendingJoinConfirmLabel(confirming: boolean): string {
  return confirming ? JOIN_CONFIRMING_NAME : JOIN_CREATE_ACCOUNT_NAME;
}

/** The persona fields both signup doors ask for, and the line a confirm without a name shows. */
export const JOINER_PERSONA_NAME_FIELD = "Your name in the story";
export const JOINER_PERSONA_DESCRIPTION_FIELD = "Description";
export const JOINER_PERSONA_NAME_REQUIRED = "Give your persona a name.";

/** The sentences a refused confirm shows, by the wire code the server refused with. */
export const PENDING_JOIN_REFUSED_TEXT = "Joining didn't go through. Try again in a minute.";
export const PENDING_JOIN_ALREADY_SIGNED_IN_TEXT = "You're already signed in. Open the invite link again from the app.";
export const PENDING_JOIN_ACCOUNT_EXISTS_LEAD = "An account already exists for this identity.";

/** The state of a confirm that made the account but left it disabled for an admin. */
export const PENDING_JOIN_APPROVAL_TITLE = "Waiting for approval";
export const PENDING_JOIN_APPROVAL_NOTE = "Your account is created and has a seat in the room. An admin must approve it before you can sign in.";
