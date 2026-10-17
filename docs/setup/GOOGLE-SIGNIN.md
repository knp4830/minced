# Turn on "Continue with Google"

The button is built and hidden. It appears when `NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN=true` is set on Vercel (and the site is redeployed). Do the steps below in order; the flag is last so nobody sees a button that cannot work.

You need: your Google account, the Supabase dashboard, the Vercel dashboard. About 15 minutes. Nothing here touches DNS or your portfolio.

Values used below:

| Thing | Value |
| --- | --- |
| Site | `https://minced.kevinpham.page` |
| Supabase project ref | `nmdrlfnwlqytzhunsffl` (from `NEXT_PUBLIC_SUPABASE_URL`) |
| Supabase callback (Google redirects here) | `https://nmdrlfnwlqytzhunsffl.supabase.co/auth/v1/callback` |

## 1. Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in.
2. Project picker (top bar) -> **New project**. Name: `Minced`. Create, then select it.

## 2. OAuth consent screen (Google calls it "Google Auth Platform")

1. Menu -> **APIs & Services** -> **OAuth consent screen** (or **Google Auth Platform** -> **Branding**).
2. App name: `Minced`. User support email: your email.
3. **Audience / User type: External.**
4. App domain:
   - Application home page: `https://minced.kevinpham.page`
   - Privacy policy: `https://minced.kevinpham.page/privacy`
   - Terms of service: `https://minced.kevinpham.page/terms`
   - Authorized domains: `kevinpham.page` and `supabase.co`
5. Developer contact email: your email.
6. **Scopes (Data Access):** add only `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. These are non-sensitive scopes, so no Google review is needed. Do not add anything else (Minced never reads Gmail, Drive or contacts).
7. **Publishing status:** while it says **Testing**, only the test users you list can sign in (add your own email). Click **Publish app** -> **In production** when you are ready for everyone. With only the three scopes above, publishing does not require verification; users just see the plain consent screen.

## 3. Web client

1. **APIs & Services** -> **Credentials** -> **Create credentials** -> **OAuth client ID**.
2. Application type: **Web application**. Name: `Minced web`.
3. **Authorized JavaScript origins:** `https://minced.kevinpham.page`
4. **Authorized redirect URIs:** `https://nmdrlfnwlqytzhunsffl.supabase.co/auth/v1/callback`
   (This is Supabase's address, not Minced's. Google sends people to Supabase, Supabase sends them on to `/auth/callback` on Minced.)
5. Create. Copy the **Client ID** and **Client secret**. Treat the secret like a password: paste it only into the Supabase dashboard, never into chat, git or Vercel.

## 4. Supabase dashboard

1. <https://supabase.com/dashboard> -> project -> **Authentication** -> **Sign In / Providers** -> **Google**.
2. Toggle **Enable Sign in with Google**. Paste Client ID and Client secret. Leave "Skip nonce check" **off**. Save.
3. **Authentication** -> **URL Configuration:**
   - **Site URL:** `https://minced.kevinpham.page` (the branded emails build their links from this)
   - **Redirect URLs:** add `https://minced.kevinpham.page/**`. Keep any existing entries you still use.
   Sign-in returns to `/auth/callback`; a URL not on this list silently falls back to the Site URL.
4. **Authentication** -> **Sign In / Providers** -> **Auth Providers** settings: leave **Allow manual linking** off. By default Supabase links a Google sign-in to an existing email account with the same verified address instead of creating a duplicate.

## 5. Vercel

1. Vercel -> project `minced` -> **Settings** -> **Environment Variables**.
2. Add `NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN` = `true` for **Production** only.
3. Also confirm `NEXT_PUBLIC_SITE_URL` = `https://minced.kevinpham.page` is set for Production (the code falls back to that value if missing).
4. **Deployments** -> latest production deployment -> **Redeploy** (these are build-time variables; a redeploy is required).

## 6. Test checklist

Use a private window, on `https://minced.kevinpham.page` (not the old `*.vercel.app` address, which redirects; the sign-in cookie only works on the host that started the sign-in).

- [ ] `/login` and `/signup` show "Continue with Google", the log-in modal does too, `/forgot-password` does not.
- [ ] Click it: Google's consent screen says **Minced** and lists only name, email, profile picture.
- [ ] Approve: you land on `/account` signed in. Header shows your account.
- [ ] Supabase -> Authentication -> Users shows the new user with provider **google**, and **Table Editor -> profiles** has a matching row.
- [ ] Open `/login?next=/shopping`, use Google: you land on `/shopping`.
- [ ] Click Google, then **Cancel** on Google's screen: you return to `/login` with "Google sign-in was cancelled" and no error page.
- [ ] Sign out, then sign in with Google using an address that already has a password account: you get the same account (favorites still there), not a second one.
- [ ] While the app is in **Testing**, an email that is not a listed test user is refused by Google (expected). Publish when ready.
- [ ] Turn the Vercel flag off and redeploy: the button disappears and nothing else changes.

## If it fails

| Symptom | Cause |
| --- | --- |
| Google says `redirect_uri_mismatch` | The redirect URI in step 3.4 differs from `https://nmdrlfnwlqytzhunsffl.supabase.co/auth/v1/callback` by even one character. |
| Browser shows raw JSON `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}` at `.../auth/v1/authorize` | The flag is on but the Google provider is not enabled in Supabase (step 4). The app cannot detect this: the server action only builds the URL, so the person is sent straight to Supabase and never returns to `/login`. Keep `NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN` off until step 4 is done; turn it off and redeploy to hide the button. |
| Back on `/login` with "couldn't sign you in with Google" | Wrong client secret, or the sign-in started on a different host than it finished on. |
| Lands on the old Site URL | `https://minced.kevinpham.page/**` is missing from Supabase Redirect URLs. |
| "Access blocked: app has not completed verification" | The app is in Testing and the email is not a listed test user. |

## Notes for later

- **Preview deployments cannot test Google sign-in.** With `NEXT_PUBLIC_SITE_URL` set to production, the redirect goes to the production host, but the sign-in cookie was set on the preview host, so the flow cannot complete. Test only on `https://minced.kevinpham.page`.
- New Google users get a `profiles` row from the existing sign-up trigger, with no display name. Minced does not copy their Google name; that is a product decision (see the wave 8 open questions).
- Local development: `supabase/config.toml` has the Google provider off. To try it on a local stack set `enabled = true` and export `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` (a separate Google client whose redirect URI is the local stack's `/auth/v1/callback`). Not needed for production.
