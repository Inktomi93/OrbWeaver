// The names of an account's credential fields, wherever an account is signed into, created or invited by its handle.
// A zero-import leaf, so a spec's node side reads them without loading the component graph.

/** The account handle field: sign-in, invite sign-up, the admin's create-user dialog and the room's invite by handle. */
export const ACCOUNT_HANDLE_FIELD_NAME = "Handle";

/** The account password field: sign-in, invite sign-up and the admin's create-user dialog. */
export const ACCOUNT_PASSWORD_FIELD_NAME = "Password";
