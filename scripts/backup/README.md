# Backups

`backup-live.sh` saves everything that is not in git: the database (public + supabase_migrations), the list of
accounts (ids, emails, sign-up dates; no password hashes), and the recipe-photos bucket (manifest + files).
It only reads from live. Output goes to `.snapshot/backups/<date>-<label>/` (gitignored).

Rehearse (local database only, refuses anything else):

    bash scripts/backup/backup-live.sh --dry-run --db-url postgresql://postgres:test@localhost:PORT/postgres

Live run (owner, or Claude with his go; needs Docker running and `.env.local` with DATABASE_URL,
NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY; restore the Supabase project first if it is paused):

    bash scripts/backup/backup-live.sh --live pre-wave15

Each folder contains a `RESTORE.md`. Not covered: Auth provider settings and email templates, Vercel env vars, DNS.
Photos are resumable: re-running into the same folder skips files already downloaded.
