/**
 * Server-side validation for the auth forms. The forms also set `required`,
 * `type="email"` and `minlength` for instant feedback, but those are a
 * courtesy: the checks here are the ones that count.
 */

export const PASSWORD_MIN = 8;
/** bcrypt, which Supabase Auth uses, only reads the first 72 bytes. */
export const PASSWORD_MAX = 72;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function validateEmail(email: string): string | null {
  if (!email) return "Enter your email address.";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "That email address doesn't look right.";
  return null;
}

export function validateNewPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  // Count bytes, not UTF-16 units: an emoji password can pass 72 "characters" and still be truncated.
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) {
    return `Use ${PASSWORD_MAX} bytes or fewer (about ${PASSWORD_MAX} characters).`;
  }
  return null;
}

/**
 * Where to send someone after signing in. Only same-site paths are allowed:
 * `//evil.example` and `/\evil.example` are treated by browsers as other hosts,
 * so a naive startsWith("/") check would be an open redirect.
 */
export function safeNext(raw: string | null | undefined, fallback = "/recipes"): string {
  if (!raw || raw.length > 300) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  return raw;
}
