/** Shared shape checks for values that arrive from the client. One copy, so they cannot drift. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A recipe slug (imported slugs are short; user slugs end in a hash). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,150}$/;
