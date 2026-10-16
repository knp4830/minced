# Real sign-in emails: custom SMTP and branded templates

Supabase's built-in mailer is for testing: a couple of emails per hour, and only to your own team's addresses. Before real people sign up you need your own SMTP provider. This guide uses a **subdomain**, so your portfolio's existing mail records on `kevinpham.page` are never touched.

## 1. Which provider

Free tiers as of 2026-10-16 (from each vendor's pricing page; check again before relying on a number):

| | Free allowance | SMTP | Notes |
| --- | --- | --- | --- |
| **Resend** | 3,000/month, 100/day, 3 domains | Yes | Simplest dashboard, gives exact DNS records, works with Supabase's SMTP form. <https://resend.com/pricing> |
| **Brevo** | Daily cap on the free plan (published as about 300/day; the pricing page did not state it when checked) | Yes | Generous daily volume; adds marketing features you do not need. <https://www.brevo.com/pricing/> |
| **Postmark** | 100/month, permanent, no overage | Yes | Best deliverability reputation, but 100/month is too few once sign-ups start. <https://postmarkapp.com/pricing> |

**Recommendation: Resend.** 100/day is far above what sign-up and reset emails need at this stage. Move to a paid tier (or Postmark) only if you pass it.

## 2. Sending address and subdomain

- From address: `noreply@minced.kevinpham.page`
- Sending domain in Resend: `minced.kevinpham.page`. Resend puts its records under a `send` label on that name (for example `send.minced`), and DKIM under `resend._domainkey.minced`. None of these exist on, or change, the apex `kevinpham.page`, so the portfolio's website and any email on `@kevinpham.page` are unaffected.

Your DNS is at Porkbun. **Do not touch the existing apex MX, SPF (`v=spf1 …`) or DKIM records.**

## 3. Add the domain at Resend

1. Resend -> **Domains** -> **Add Domain**. Name: `minced.kevinpham.page`. Region: closest to your users (US East is fine).
2. Resend then shows a table of records. **Copy them exactly from that screen** (the DKIM value is long and unique to you). Expect this shape:

| Type | Host (Porkbun "Host" field) | Value | Priority |
| --- | --- | --- | --- |
| TXT | `resend._domainkey.minced` | `p=…` (long DKIM public key, from Resend) | n/a |
| MX | `send.minced` | `feedback-smtp.<region>.amazonses.com` (from Resend) | 10 |
| TXT | `send.minced` | `v=spf1 include:amazonses.com ~all` (from Resend) | n/a |

Porkbun's Host field takes only the part before `.kevinpham.page`, so `send.minced` becomes `send.minced.kevinpham.page`. Leave "TTL" at default.

3. Recommended extra record, a DMARC policy for the subdomain only:

| Type | Host | Value |
| --- | --- | --- |
| TXT | `_dmarc.minced` | `v=DMARC1; p=none; rua=mailto:YOUR_EMAIL` |

   Start at `p=none` (just reports). Do not add a `_dmarc` record at the apex without checking what your portfolio's mail already has.
4. Porkbun -> your domain -> **DNS Records** -> add each row. Remove nothing.
5. Back in Resend press **Verify DNS Records**. It can take minutes to a few hours. Wait until it says **Verified**.

## 4. SMTP credentials

1. Resend -> **API Keys** -> create a key named `supabase-smtp`, permission **Sending access**, domain `minced.kevinpham.page`. Copy it once. Never paste it into chat, git or Vercel.
2. SMTP settings for Resend: host `smtp.resend.com`, port `465` (or `587`), username `resend`, password = the API key.

## 5. Supabase Auth SMTP

Supabase dashboard -> **Authentication** -> **Emails** -> **SMTP Settings** (older: Project Settings -> Authentication) -> enable **Custom SMTP**:

- Sender email: `noreply@minced.kevinpham.page`
- Sender name: `Minced`
- Host: `smtp.resend.com`, Port: `465`
- Username: `resend`
- Password: the API key
- Save.

Then **Authentication** -> **Rate Limits** -> raise **emails sent per hour** from the small default (30 is plenty to start; the free Resend cap is 100/day, so do not set it so high that the provider cuts you off first).

## 6. Branded templates

The four templates live in `supabase/templates/`. Production does not read the repo, so paste each one in:

Supabase dashboard -> **Authentication** -> **Emails** -> **Templates**:

| Dashboard tab | File | Subject |
| --- | --- | --- |
| Confirm sign up | `confirmation.html` | Confirm your email for Minced |
| Reset password | `recovery.html` | Reset your Minced password |
| Magic link | `magic_link.html` | Your Minced log-in link |
| Change email address | `email_change.html` | Confirm your new email for Minced |

Open the file, copy everything (including the leading comment is fine), paste into the **Message body (source)** editor, set the Subject, **Save**.

These links go to `{{ .SiteURL }}/auth/callback?token_hash=…`, so **Authentication -> URL Configuration -> Site URL must be exactly `https://minced.kevinpham.page`** (no trailing slash). The benefit: the link works even if the email is opened on a different device from the one that signed up. Behaviour to know: a sign-up confirmation always lands on `/account`, because the email cannot carry the page you started on.

Also check **Authentication** -> **Sign In / Providers** -> **Email**: **Confirm email** should be **on** so sign-ups are confirmed.

## 7. Test

Use a real inbox you own (Gmail and one non-Gmail address if you can).

- [ ] Sign up on `https://minced.kevinpham.page/signup`. The email arrives within a minute, from "Minced <noreply@minced.kevinpham.page>", with the green button.
- [ ] Open the email's headers (Gmail: Show original): SPF **PASS**, DKIM **PASS**, DMARC **PASS**.
- [ ] Open the email on your phone while the browser that signed up is on your computer. The button still confirms the account and signs you in.
- [ ] Tap the button a second time: you get "That link has expired or was already used" on the log-in page, not a crash.
- [ ] Forgot password: the reset email arrives, the button opens `/reset-password`, saving a new password works, and log-in with it works.
- [ ] Account page -> change email (if offered): both addresses get the change email.
- [ ] Check spam; if it lands there, send a test through <https://www.mail-tester.com> and fix what it lists.
- [ ] Resend -> **Emails** shows the sends as Delivered.

## If it fails

| Symptom | Cause |
| --- | --- |
| "Error sending confirmation email" on sign-up | Wrong SMTP password, domain not Verified yet, or the sender address is not on the verified domain. |
| Buttons in the email open a broken page | Site URL in Supabase is not `https://minced.kevinpham.page`. |
| Lands in spam | DNS not fully verified, or the first few sends from a new domain; send a few real emails and keep DMARC at `p=none` for a week. |
| Over limit | Resend free is 100/day; the Supabase hourly limit is not the only cap. |
