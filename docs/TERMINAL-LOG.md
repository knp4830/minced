# Terminal & Git Log

> **What this file is:** every command used on this project, what it does, and what its flags mean. Written for looking things up six weeks from now.
> **How to use it:** when you run something new, add it. When you forget something, `Cmd+F` it.
> **Rule:** if you paste a command you don't understand, look it up here or ask before running it. That habit is the difference between learning the terminal and being afraid of it.

---

## The first error, and what it taught

```
kevinp@Kevins-MacBook-Air ~ % mkdir ~/code/mise && cd ~/code/mise
mkdir: /Users/kevinp/code: No such file or directory
```

**What happened:** `mkdir` creates *one* directory. It will not create missing parents. You asked it to make `mise` inside `code`, but `code` didn't exist, so it gave up — and it named the folder it couldn't find (`/Users/kevinp/code`), which is the useful part of the message.

**The fix:**

```bash
mkdir -p ~/code/mise && cd ~/code/mise
```

`-p` = *parents*. Create every missing folder in the path, and don't error if they already exist.

**The second attempt:**

```
mkdir: /project: No such file or directory
```

Different problem. The leading `/` means "start at the root of the entire filesystem," alongside `/System`, `/Applications`, `/Users`. macOS won't let you write there without `sudo`, and you shouldn't want to — your projects belong in your home folder.

**Reading error messages is a skill.** These two look similar and have different causes. `mkdir` told you exactly which path it couldn't find in both cases; the difference was *why*. Most terminal errors are this legible once you slow down and read the whole line.

---

## Paths — the thing that trips everyone up first

| Symbol | Means | Example |
|---|---|---|
| `/` | Root of the whole filesystem | `/Users/kevinp/code` |
| `~` | Your home folder (`/Users/kevinp`) | `~/code/mise` |
| `.` | The folder you're in right now | `./scripts/seed.sh` |
| `..` | One folder up | `cd ..` |
| `-` | The folder you were in before | `cd -` |

**Absolute path** starts with `/` or `~` and works from anywhere: `~/code/mise/src`.
**Relative path** starts from where you currently are: `src/app`.

Your prompt tells you where you are. `kevinp@Kevins-MacBook-Air ~ %` — that `~` is the current folder. Inside the project it becomes `mise %`. When a command misbehaves, check that first: **you are very often just in the wrong directory.**

```bash
pwd    # print working directory — "where am I?"
```

---

## Navigating and looking around

```bash
pwd                  # where am I
ls                   # list files here
ls -la               # list ALL files (-a, including dotfiles like .env) in long form (-l)
cd ~/code/mise       # go somewhere
cd ..                # up one level
cd -                 # back to the previous folder
open .               # macOS: open the current folder in Finder
code .               # open the current folder in VSCode
```

`ls -la` is the one to memorize. Files starting with `.` are hidden by default — and `.env`, `.gitignore`, and `.github/` are all files you'll care about. Plain `ls` won't show them.

**Flags combine.** `-la` is `-l -a`. This is true of most commands.

---

## Creating, moving, deleting

```bash
mkdir docs                    # make a directory
mkdir -p src/lib/queries      # make it and any missing parents
touch README.md               # create an empty file (or update its timestamp)
cp file.txt backup.txt        # copy
cp -r docs/ docs-backup/      # copy a folder (-r = recursive, into subfolders)
mv old.txt new.txt            # rename
mv file.txt docs/             # move into a folder
rm file.txt                   # delete a file
rm -rf node_modules           # delete a folder and everything in it
```

> **`rm -rf` has no undo and no Trash.** There is no recovery. Before running it, read the path out loud. `rm -rf ~/code` would delete this entire project silently. It's a normal, necessary command — just never run it on autopilot.

---

## Reading files

```bash
cat CLAUDE.md            # dump the whole file
head -20 package.json    # first 20 lines
tail -20 error.log       # last 20 lines
less BUILD-PLAN.md       # scrollable viewer — arrows to move, q to quit
```

`less` is what you want for anything long. `q` quits — worth knowing before you get stuck in it.

---

## Chaining commands

| Operator | Means |
|---|---|
| `&&` | Run the next command **only if** the previous one succeeded |
| `;` | Run the next command regardless |
| `\|` | Pipe: send the first command's output into the second |
| `>` | Write output to a file, **overwriting** it |
| `>>` | Append output to a file |

```bash
mkdir -p ~/code/mise && cd ~/code/mise   # only cd if mkdir worked
ls -la | grep ".env"                     # list files, keep only lines containing .env
echo "node_modules" >> .gitignore        # append a line
```

`&&` is the one you'll use constantly, and using it instead of `;` is a small safety habit: if the first command fails, the second doesn't run against the wrong state.

---

## Git — the ~12 commands that are 95% of daily use

```bash
git init -b main             # start a repo, name the first branch "main"
git status                   # what's changed — run this constantly
git add file.txt             # stage one file
git add -A                   # stage everything changed
git commit -m "message"      # save a snapshot of what's staged
git log --oneline -10        # last 10 commits, one line each
git diff                     # what changed but isn't staged yet
git diff --staged            # what's staged and about to be committed
```

**Branches:**

```bash
git branch                        # list branches, * marks current
git checkout -b feat/m0-3-scaffold  # create a branch AND switch to it
git checkout main                 # switch to an existing branch
git branch -d feat/old-thing      # delete a merged branch
```

**Talking to GitHub:**

```bash
git push -u origin main      # push, and remember this remote (-u, first time only)
git push                     # after that, just this
git pull                     # fetch and merge others' changes (or your own from another machine)
git remote -v                # which GitHub repo is this connected to
```

**The mental model:** git has three places a change can live.

```
working directory  →  staging area  →  commit history
   (you edit)          (git add)        (git commit)
```

`git status` shows you which stage everything is in. When git confuses you, run `git status` first — it usually tells you what to do next, in plain English.

**Undo, in increasing severity:**

```bash
git restore file.txt              # discard uncommitted changes to a file
git restore --staged file.txt     # unstage, but keep the changes
git commit --amend                # fix the most recent commit message
git reset --soft HEAD~1           # undo last commit, KEEP the changes staged
git reset --hard HEAD~1           # undo last commit, DESTROY the changes
```

> `--hard` discards work permanently. Reach for `--soft` first — it's almost always what you actually wanted.

---

## Git commands that look interchangeable but aren't

| You might type | What it actually does | Prefer |
|---|---|---|
| `git checkout -b name` | Create branch and switch. Errors if it exists. | ✅ this |
| `git checkout -B name` | Create, **or silently reset an existing branch to the current commit**, discarding its unmerged work | ⚠️ avoid |
| `git branch -D name` | Force-delete a branch (different command — `-D` is not a `checkout` flag) | when deleting |
| `git add .` | Stage changes **in the current directory and below** | fine from repo root |
| `git add -A` | Stage changes **anywhere in the repo**, wherever you're standing | ✅ this |
| `git commit -a` | Auto-stage modified **tracked** files, then commit. **Skips untracked (new) files.** Opens an editor without `-m`. | see below |
| `git commit -m "..."` | Commit what's staged, message inline | ✅ this |
| `git push origin branch-name` | Explicit, works every time | fine |
| `git push -u origin HEAD` | `HEAD` = current branch (no typos); `-u` sets upstream so later pushes are just `git push` | ✅ this |

**The `-a` trap, spelled out.** `git commit -a` only picks up files git already knows about. Create `src/lib/queries.ts`, run `git commit -a -m "add queries"`, and that file is **not** in the commit. Everything looks fine locally and the deploy fails. `git add -A` first, or `git status` before every commit — untracked files appear in their own section, and noticing them is the habit.

**`git add . && git commit -a` is redundant.** The `add` already staged everything, including new files; `-a` then re-stages the tracked ones. Harmless, but `git add -A && git commit -m "..."` is the same thing without the confusion.

## GitHub CLI (`gh`)

```bash
gh auth status                    # am I logged in
gh auth login                     # log in
gh repo create mise --private --source=. --remote=origin
gh repo view --web                # open this repo in the browser

gh issue list                     # open issues
gh issue list --milestone "Phase 0 — Foundations"
gh issue create --title "..." --body "..." --label "type:feature"

gh pr create --fill               # open a PR using the branch's commits
gh pr view --web                  # open the PR in the browser to read your own diff
gh pr merge --squash --delete-branch
```

`gh` exists so you don't context-switch to the browser for routine things. The one exception, deliberately: **read your own diff in the browser before merging.** The web view makes problems visible in a way the terminal doesn't.

---

## Node and pnpm

```bash
node -v                    # check Node version (need 20+)
pnpm -v                    # check pnpm is installed
npm i -g pnpm              # install pnpm globally

pnpm install               # install everything in package.json
pnpm add zod               # add a dependency
pnpm add -D vitest         # add a DEV dependency (-D: build/test only, not shipped)
pnpm remove zod            # remove one

pnpm dev                   # start the dev server
pnpm build                 # production build
pnpm lint                  # run the linter
```

**`-D` matters.** Dev dependencies (test runners, type definitions, linters) don't ship to production. Putting them in the wrong place bloats your deploy.

---

## When you're stuck

```bash
man mkdir        # full manual — q to quit
mkdir --help     # shorter summary (some macOS commands don't support this)
which node       # where is this command installed
```

`Ctrl+C` cancels a running command. `Ctrl+A` jumps to the start of the line, `Ctrl+E` to the end. Up-arrow cycles through your history.

```bash
history | grep mkdir     # find a command you ran before but can't remember
```

---

## Running log — commands used on this project, in order

| Date | Command | Why | What I learned |
|---|---|---|---|
| 2026-08-24 | `mkdir ~/code/mise` | Create project folder | **Failed.** `mkdir` won't create parent folders |
| 2026-08-24 | `mkdir /project/mise` | Retry | **Failed.** `/` is the filesystem root, needs sudo, wrong place anyway |
| 2026-08-24 | `mkdir ~p ~/code/mise` | Typo for `-p` | `~name` means that user's home dir, so zsh looked for a user called `p`. The shell expands `~`, `*`, `$` *before* running the command |
| 2026-08-24 | `mkdir -p ~/code/mise && cd ~/code/mise` | Create it properly | `-p` creates parents; `&&` only runs `cd` if `mkdir` succeeded |
| 2026-08-24 | `gh api repos/{owner}/{repo}/milestones -f title="..." --silent` | Create 8 milestones | **Failed 8× with 422.** `--silent` hid the reason. Never use it on an unproven command. 8 identical failures = systemic cause, not a data problem |
| 2026-08-26 | `pnpm dlx create-next-app@15.5.24 mise-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack --skip-install` | Scaffold Next.js 15 | `dlx` runs a package once without installing it globally. Pinned `@15.5.24` because `@latest` now resolves to Next 16. Ran it in a scratch dir because create-next-app refuses to write into a non-empty folder |
| 2026-08-26 | `rsync -av --ignore-existing --exclude '.git/' --exclude 'README.md' --exclude '.gitignore' SRC/ DEST/` | Move the scaffold into the real repo | `--ignore-existing` is the safety net: it copies only paths that don't exist yet, so nothing already written gets clobbered. The trailing `/` on the source means "the contents of", not "the folder itself" |
| 2026-08-26 | `pnpm install` | Install dependencies | **Failed.** `ERR_PNPM_IGNORED_BUILDS: unrs-resolver`. pnpm 11 blocks dependency install scripts by default (supply-chain defense) and treats an unapproved one as a hard error, which also fails `pnpm build` |
| 2026-08-26 | added `pnpm.onlyBuiltDependencies` to `package.json` | Approve that build script | **Failed, silently.** pnpm 11 no longer reads the `pnpm` field in package.json. `pnpm rebuild` was the only command that printed the warning saying so — the error message itself never mentioned it |
| 2026-08-26 | `printf 'allowBuilds:\n  unrs-resolver: true\n' > pnpm-workspace.yaml` | Approve it in the right place | pnpm 11 moved these settings to `pnpm-workspace.yaml`, and the key is `allowBuilds`, not `onlyBuiltDependencies`. pnpm itself wrote a placeholder block into that file — reading the file it generated was the fix |
| 2026-08-26 | `pnpm build` | Verify production build | Compiles all routes ahead of time and prints a route table with bundle sizes. `○ (Static)` means prerendered at build time |
| 2026-08-26 | `pnpm lint` | Verify ESLint | **Failed** on `design/support.js` — the mockup runtime, not app code. ESLint lints the whole repo by default; added `design/**` and `scripts/**` to `ignores` in `eslint.config.mjs` |
| 2026-08-26 | `pnpm dev` | Run the dev server | **Failed twice.** (1) `MODULE_NOT_FOUND .next/server/app/page.js` — a stale `.next` left by `pnpm build`; `rm -rf .next` fixes it. (2) Then a 404, because an orphaned dev server still held port 3000, so the new one silently moved to 3001 and I was curling the old one |
| 2026-08-26 | `lsof -ti:3000 \| xargs kill -9` | Kill whatever holds a port | `lsof -ti:PORT` prints just the PIDs of processes listening there; `xargs` feeds them to `kill`. The fix for "port is in use" |
| 2026-08-26 | `curl -s -o file -w "%{http_code}" http://localhost:3210` | Prove the page actually serves | `-o` saves the body, `-w "%{http_code}"` prints just the status. Checking for a 200 *and* grepping the body is what makes it evidence rather than a guess |
| 2026-08-27 | `gh api repos/OWNER/REPO/deployments --jq '.[0].id'` | Find the Vercel deploy from the terminal | Vercel writes a *deployment* record back to GitHub. `--jq` filters the JSON inline so you don't need to pipe to `jq` |
| 2026-08-27 | `gh api repos/OWNER/REPO/deployments/ID/statuses --jq '.[].environment_url'` | Get the live URL | The status record carries the deployed URL and whether the build succeeded |
| 2026-08-27 | `curl -s -o page.html -w "%{http_code}" URL` then `grep "<title>" page.html` | Prove the site is really public | **Caught a real bug.** Status was 200 but the body was `<title>Login – Vercel</title>` — Vercel Authentication was on. Always check the body, not just the code |
| 2026-08-27 | `gh api repos/OWNER/REPO/branches/main/protection` | Check branch protection | **403.** GitHub Free doesn't offer branch protection on *private* repos. Rulesets return the same 403 — same limitation, newer API |
| 2026-08-27 | `git rev-list --all \| while read c; do git grep -InEi "PATTERN" $c; done` | Scan every commit for secrets before going public | Going public exposes *all history*, not just the current files. `git grep` takes a commit argument, so this searches each one in turn |
| 2026-08-27 | `gh repo edit OWNER/REPO --visibility public --accept-visibility-change-consequences` | Make the repo public | The long flag is deliberate friction — GitHub wants you to acknowledge that this can't be quietly undone |
| 2026-08-27 | `git config user.email "...@users.noreply.github.com"` | Stop leaking a personal email into commits | No `--global`, so it applies to **this repo only**. Affects future commits; existing ones keep the old address |
| 2026-08-27 | `gh api -X PUT repos/OWNER/REPO/branches/main/protection --input -` | Require PRs on main | `--input -` reads the JSON body from stdin, which is how you pass a heredoc to `gh api` |
| 2026-08-27 | `gh api -X POST repos/OWNER/REPO/branches/main/protection/enforce_admins` | Apply protection to yourself too | **The one that mattered.** Protection defaults to exempting admins — on a solo repo that protects nobody |
| 2026-08-27 | `git commit --allow-empty -m "test" && git push origin main` | Actually test the DoD | `--allow-empty` makes a commit with no file changes — perfect for testing a push rule. Got `GH006 ... protected branch hook declined`, then `git reset --hard origin/main` to discard it |
| 2026-09-16 | `git checkout -b chore/rename-to-minced` | Branch for the rename | `-b` creates the branch and switches to it in one step. `main` is protected, so even a rename needs its own branch |
| 2026-09-16 | `git mv design/Mise.dc.html design/Minced.dc.html` | Rename the mockup file | `git mv` is a plain move plus `git add`. Git doesn't store renames — it infers them from matching content when you look at the diff |
| 2026-09-16 | `sed -i 's/\bMise\b/Minced/g' FILES` | Rename across docs | `\b` is a word boundary, so `Promise` and `Minimise` are left alone. **Still too blunt:** it turned *Mise en place* into "Minced en place" and changed a string the seed script uses as a lookup key. Always read the diff after a bulk replace |
| 2026-09-16 | `git show main:supabase/seed.sql > seed_old.sql` | Get the pre-rename seed to test against | `git show BRANCH:PATH` prints a file as it exists on another branch, without switching to it |
| 2026-09-16 | `docker run -d --name minced-seedtest postgres:16-alpine` | Throwaway DB to test the seed fix | **Failed.** Docker Desktop wasn't running (`cannot find dockerDesktopLinuxEngine`). After starting it, it returned **500** errors: `wsl -l -v` showed no WSL distributions, so the Linux engine never started. Test not run |
| 2026-09-16 | `pnpm lint` / `pnpm build` (Windows) | Verify the rename didn't break anything | **Failed: `pnpm: command not found`.** First session on the Windows machine: no pnpm, no `node_modules`. The project was only ever installed on the Mac. Setup (`corepack enable`, `pnpm install`) still to do |
| 2026-09-16 | `gh auth status` | Check the GitHub CLI can open a PR | **Not logged in** on the Windows machine. `gh` keeps its own login, separate from git's. Fix: `gh auth login` (interactive, opens a browser) |
| 2026-09-16 | `git push -u origin chore/rename-to-minced` | Publish the branch | Worked anyway — **git** uses Windows Credential Manager, not `gh`. `-u` sets the upstream so later plain `git push`/`git pull` know where to go |
| 2026-09-17 | `open -a Docker` | Start Docker Desktop from the terminal | `-a` launches an *application* by name. The daemon takes ~30s after the app opens — `docker info` succeeding is the real ready signal, not the app appearing |
| 2026-09-17 | `docker run -d --name minced-test -e POSTGRES_PASSWORD=test postgres:16-alpine` | Throwaway DB to test the M1.5.1 migration | `-d` detaches. The migration test CLAUDE.md asks for: apply everything to a scratch database before it ever touches the real one |
| 2026-09-17 | `docker exec minced-test pg_isready -U postgres` in a `for` loop | Wait for Postgres to accept connections | The container is "running" well before Postgres is listening. Polling `pg_isready` is the difference between a reliable script and a flaky one |
| 2026-09-17 | `for f in supabase/migrations/*.sql; do docker exec -i minced-test psql -U postgres -v ON_ERROR_STOP=1 -q < "$f"; done` | Apply every migration in order | Glob expansion sorts by filename, which is why migrations are timestamp-prefixed. `-v ON_ERROR_STOP=1` is essential — without it psql prints the error and *keeps going*, exiting 0 |
| 2026-09-17 | `create schema auth; create table auth.users ...; create role anon;` | Stub Supabase's auth surface | Plain Postgres has no `auth` schema, no `auth.uid()`, and no `anon`/`authenticated` roles, so the RLS migration fails without them. Four lines buys a faithful local test |
| 2026-09-17 | `docker run ... postgres:17-alpine` | Re-test on the engine production actually runs | Supabase reports `postgres_engine: 17`; the first test ran on 16. Testing on the wrong major version proves less than it looks like it does |
| 2026-09-17 | `DATABASE_URL="postgresql://postgres:test@host.docker.internal:55433/postgres" ./scripts/ingredient-coverage.sh f.txt` | Point a script at the test container | **Failed — it hit the live database instead.** `set -a && . ./.env.local` *overwrites* variables already exported. Fixed both scripts to load `.env.local` only when `DATABASE_URL` is unset. `host.docker.internal` is how a container reaches a port on the Mac |
| 2026-09-17 | `npx tsc --noEmit` | Typecheck without emitting files | Caught that `src/types/database.ts` didn't know the new RPC functions — the stale-snapshot problem CLAUDE.md warns about, showing up exactly as predicted |
| 2026-09-17 | `python3 -m venv scripts/parser/.venv` | Isolate the Python parser | A venv is a private copy of Python for one project. Keeps an ML stack out of the system Python, and `rm -rf` on the folder fully undoes the install |
| 2026-09-17 | `scripts/parser/.venv/bin/pip install ingredient-parser-nlp` | Install the parser | Calling the venv's `pip` **by path** is what installs into the venv. Pulls numpy, nltk and a CRF model — 76 MB, which is why it is gitignored, not committed |
| 2026-09-17 | `pip freeze > requirements.txt` | Pin every version | `freeze` writes exact versions including transitive deps, so a rebuilt venv behaves identically. Note pip names it `ingredient_parser_nlp` (underscores) even though you install `ingredient-parser-nlp` |
| 2026-09-17 | `jq -R -s 'split("\n") \| map(select(. != ""))' < lines.txt` | Turn a text file into a JSON array | `-R` reads raw lines instead of JSON, `-s` slurps them into one string. The `select` drops the empty element a trailing newline creates |
| 2026-09-17 | `echo '[...]' \| bash scripts/parser/run.sh \| jq -c '.[]'` | Test the parser's output contract | **Caught a real bug.** `jq: parse error: Invalid numeric literal` — the library prints `Warning:` lines to *stdout*, corrupting the JSON. Only bad input triggered it; the happy path looked perfect |
| 2026-09-17 | `mv scripts/parser/.venv /tmp/... && bash scripts/parser/setup.sh` | Prove the venv rebuilds from scratch | Moving it aside rather than deleting it means a failed rebuild is recoverable. Don't claim "reproducible" without deleting the thing and rebuilding it |
| 2026-09-17 | `git add -A && git diff --cached --name-only` | Check what would actually be committed | The honest way to verify a `.gitignore` rule. `git check-ignore -v <path>` goes further and prints *which line* of which file does the ignoring |
| 2026-09-17 | `du -sh scripts/parser/.venv` | Check how big the venv got | 76 MB. Worth knowing before wondering whether to commit it (don't) |
| 2026-09-18 | `curl -s "http://web.archive.org/cdx/search/cdx?url=myplate.gov/recipes/*&fl=original&collapse=urlkey"` | Find every archived recipe page | The Wayback CDX API is a queryable index of everything archived. `collapse=urlkey` dedupes the many captures of one URL down to one row. This is how you inventory a site that no longer exists |
| 2026-09-18 | `curl -sL "https://web.archive.org/web/2025id_/https://www.myplate.gov/recipes/SLUG"` | Fetch the original page | The `id_` suffix asks for the page as ARCHIVED, without the Wayback toolbar injected into the HTML. Without it you parse their chrome as if it were content |
| 2026-09-18 | `JOBS=4 bash scripts/myplate/fetch.sh` | Speed up 1,201 downloads | **Backfired.** 953 of 1,201 failed with curl code `000` — archive.org stopped accepting connections. Not a 429 you can read, just refusal. JOBS=2 with `--retry 3 --retry-delay 5` is stable. Politeness here is a technical requirement, not manners |
| 2026-09-18 | `xargs -P N -I{} bash -c 'fn "$@"' _ {}` | Run a shell function in parallel | `export -f fn` first, or the subshell has never heard of it. The `_ {}` passes the item as `$1` rather than mangling it into the command string |
| 2026-09-18 | `jq -R -s 'split("\n")'` / `jq '.[1] \| {slug,title}'` | Inspect pipeline artifacts between stages | Writing each stage to a file and looking at it with `jq` is what made the JSON-LD gap obvious — USDA's structured data has nutrition but no ingredients |
| 2026-09-18 | `docker run -v "$PWD:/repo" -w /repo postgres:16-alpine psql ... -f file.sql` | Run SQL containing `\copy` from a container | `\copy` is a psql CLIENT command: it reads and writes the filesystem *psql* sees. Piping the file in on stdin puts the paths in the wrong world; mounting the repo and matching the working directory keeps every relative path valid |
| 2026-09-18 | `psql -c "select normalize_ingredient_name('Jalapeño')"` | Check a function against real input | Returned `jalape o` — the accent became a word break. Test text functions with the characters your data actually contains, not the ASCII you had in mind |
| 2026-09-18 | `reindex index <name>` | Rebuild after changing an indexed function | An expression index stores values from the OLD function body. Postgres neither notices nor rebuilds it, so lookups silently miss until you reindex |
| | | | |

*Append a row every time you run something new. Keep the failures — those are the rows you'll actually come back and read.*
