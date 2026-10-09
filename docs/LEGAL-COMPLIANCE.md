# Legal and compliance research

> **This is research, not legal advice.** It was compiled on 2026-10-08 by an AI assistant from web searches, mostly law-firm and compliance-vendor summaries plus some regulator pages. I am not a lawyer. Where a statement rests on a secondary source, or on my own background knowledge rather than a page I read this session, it is tagged. Before launch, spend an hour with a lawyer (many offer flat-fee startup reviews) on the items marked **Lawyer**. Dates and thresholds move; re-verify anything load-bearing.

Scope: a public recipe web app (Next.js on Vercel, Supabase auth and Postgres), run by a US-based solo developer, with users who may be anywhere.

**Evidence tags used below**

| Tag | Meaning |
|---|---|
| **[P]** | A primary source (statute, regulator or platform page) was returned by search this session. |
| **[S]** | Only secondary commentary (law firm, vendor blog) was found. Treat as a lead, not a fact. |
| **[M]** | From my background knowledge, not re-verified this session. Verify before relying. |

---

## 0. What Minced actually does today (the facts the analysis depends on)

From `CLAUDE.md`, `docs/BUILD-PLAN.md` and `docs/SCHEMA-NOTES.md`:

- Live catalog of 878 recipes: 872 imported from USDA MyPlate Kitchen (read from the **Internet Archive capture** of the retired myplate.gov, because the site shut down on 2026-01-07), plus 6 hand-seeded mockup recipes. Provenance columns `source_name`, `source_url`, `source_license` already exist on `recipes`.
- Planned: Tier 2 recipes **drafted by an LLM**, human-reviewed, in Minced's voice (M1.5.5). Tier 3 scrape-and-rewrite is deferred.
- Planned: nutrition from USDA FoodData Central (M1.5.4); Supabase Auth with email and Google OAuth (M4.1); favorites and accounts (M4.2, M4.3); user-created recipes (M5); PostHog and Sentry (Phase 6); a "paste a blog URL, get a clean recipe" import (not yet in BUILD-PLAN; v1.3 is the nearest, admin-only).
- v1 uses color-block placeholders, no photos. User photo upload is explicitly out of v1.
- No payments, ads or monetization in v1. Hosting is Vercel; the URL is a `vercel.app` subdomain.
- Not yet a data-collecting product: until M4.1 ships there are no user accounts, so most privacy duties below attach at M4.1, not today. Two things already apply today: the attribution duties (the USDA content is live) and the Vercel plan question.

---

## 1. Recipe copyright

### 1.1 The rule

- **Statute.** 17 U.S.C. § 102(b): copyright never extends to "any idea, procedure, process, system, method of operation". A recipe's functional core (what goes in, in what order, at what temperature) sits on the unprotected side. **[M]** (statute text not fetched this session; it is stable and widely quoted).
- **Copyright Office.** Circular 33, "Works Not Protected by Copyright", says mere listings of ingredients are not protected; a recipe accompanied by substantial literary expression, or a compilation such as a cookbook, can be. Source: <https://www.copyright.gov/circs/circ33.pdf> **[P]** (the PDF text I received was truncated, so the exact wording above is as quoted by secondary summaries; read the circular itself).
- **Case law.** *Publications International, Ltd. v. Meredith Corp.*, 88 F.3d 473 (7th Cir. 1996): the compilation copyright in a yogurt cookbook covered the selection and arrangement, not the individual recipes; a functional list of ingredients plus directions is not original expression. The court left open that a recipe with real literary content (stories, presentation advice, wine pairings) could be protected. Opinion: <https://inns.innsofcourt.org/media/129123/Publ_ns%20Int_l_%20Ltd.%20v.%20Meredith%20Corp._%2088%20F.3d%20473.pdf> **[P/S]** (found via search; the summary above comes from commentary on it). A later case, *Barbour v. Head* (S.D. Tex. 2001), found protection where recipes carried extensive creative commentary that was copied verbatim **[S]**. *Lambing v. Godiva Chocolatier* (6th Cir. 1998) is the other usually-cited authority for "recipes are facts/procedures" **[M]**.
- **Bar association overview:** <https://www.nycbar.org/wp-content/uploads/2023/05/20221024-SecretIngredientsHowtoProtectRecipes_FINAL_22.6.6.pdf> **[P, not read in full]**.

### 1.2 What that means for Minced's catalog

| Content | Status | Minced's position |
|---|---|---|
| Ingredient names, quantities, units, times, temperatures, servings | Facts / functional. Free to use. | Safe. Minced already stores these as structured rows. |
| Numbered steps in plain imperative language | Functional, but the *wording* of a distinctive step can be expression. Merger doctrine usually saves short, functional steps. | Low risk when original or public domain; rewrite when taken from a copyrighted source. |
| Headnotes, stories, tips, serving suggestions, photos | Protected expression. | Minced's "no headnotes, no anecdotes" rule is also a legal-risk control. Keep it. |
| A whole site's compilation (selection and order of thousands of recipes) | Possibly protected as a compilation and, in the EU, by the sui generis database right **[M]**. | Do not bulk-mirror another site's catalog. |

Practical rules: record provenance on every row (already done), never store another site's prose, never use their photos, and keep the "reject, don't import" gates.

### 1.3 MyPlate Kitchen: "public domain" needs one more check

- 17 U.S.C. § 105: works *prepared by an officer or employee of the US Government as part of their official duties* have no US copyright **[M]**. That is why the BUILD-PLAN calls MyPlate "public domain by statute".
- MyPlate's own About page says its recipes come from USDA Food and Nutrition Service programs, including CNPP and SNAP: <https://myplate-prod.azureedge.us/about-us> **[P]**. I **could not find** an official statement on that page that every MyPlate Kitchen recipe is public domain. A Food Network page calls them public domain, which is not an authority **[S]**.
- Gap to close: government sites sometimes host **contributed or contracted** material (partner-submitted recipes, contractor-written content, licensed photos). § 105 does not cover work by contractors unless the contract assigns it, and does not cover third-party content the agency merely displays. MyPlate's *partner* resources page says partner materials may be used without permission but asks for attribution to the source and to MyPlate.gov: <https://myplate-prod.azureedge.us/partner-resources> **[P]**.
- **Action (M1.5.7 / pre-launch):** run a query over the 872 imported rows for markers of non-USDA authorship: "courtesy of", "©", "copyright", "used with permission", partner names, "adapted from". Quarantine hits for a manual check (set `source_license` to `needs_review`). Cheap, and it converts "I believe it is public domain" into an audited claim. Also record the Internet Archive capture date in `source_url`/metadata so the origin is reproducible.
- **Mirror terms.** BUILD-PLAN notes that the surviving third-party mirror forbids replicating its catalog, so the importer used the Archive capture instead. That is sound (the restriction binds only people who agreed to the mirror's terms; it cannot create rights in public-domain content), but **Lawyer**: confirm you never accepted the mirror's terms (no account, no API key) and that no scraper hit the mirror itself. Keep a note of how the importer fetched data.

### 1.4 The planned "paste a blog URL, get a clean recipe" feature

Research summary of the risk surface, then a design recommendation.

**Copyright.** Extracting facts (title, ingredients, quantities, times, servings, yield) is the safe core under *Meredith* **[S]**. The risk is copying the blogger's **prose**: headnote, anecdotes, descriptive instruction text, photos. Storing a verbatim copy of instruction text on your servers is reproduction, even if never displayed publicly; whether it is fair use for a private user feature is unsettled.

**Contract (site Terms of Service).** Copyright is not the only exposure. Courts have enforced site terms against scrapers when the scraper actually assented (e.g. a Texas federal court enforced Southwest's terms in 2021) **[S]**; browsewrap terms behind a footer link are harder to enforce against logged-out visitors **[S]**.

**Anti-hacking law.** *hiQ v. LinkedIn* (9th Cir.) held scraping *public* pages is not "without authorization" under the CFAA; hiQ still lost on contract grounds and settled **[S]**. *Meta v. Bright Data*: logged-out scraping of public data was not barred by Meta's terms, and the case settled in early 2025, so it is not binding precedent **[S]**. Net: public, logged-out, non-circumventing fetches are in the safest zone; logged-in access and circumventing paywalls or bot protection is where liability concentrates. A 2026 report that a New York court refused to dismiss claims in *Reddit v. Perplexity* over bypassing technical protections points the same way **[S]; unverified**.

**robots.txt.** Not itself law, but ignoring it weakens a good-faith defense and is the signal publishers and courts look at **[S]**.

**EU database right.** Extracting a *substantial part* of a database can infringe; a single recipe per user request is far below that **[M]**.

**Design recommendation (keeps the feature on the low-risk side):**

1. **User-initiated, one URL at a time.** The user pastes a link; Minced fetches it on demand. No crawling, no bulk, no background re-fetch, no search-engine-style indexing of other people's sites.
2. **Private by default and forever.** Imported recipes are visible only to the importing user (author_id = that user, `visibility = private`). They must never enter the public catalog, browse, search results, pantry matching for other users, programmatic SEO pages (M3.7), or JSON-LD. That is the difference between a personal clipping tool (Paprika, Copy Me That style) and republishing.
3. **Extract structure, not prose.** Read the schema.org `Recipe` JSON-LD the publisher put there for machines (the same markup `recipe-scrapers` reads), map ingredients through the parser and `resolve_ingredient()`, keep quantities, times, yield. For the steps, either keep only a short functional paraphrase generated for the user, or store the steps minimally and link back. Do **not** store the headnote, comments, reviews, author bio, or images.
4. **Attribute and link.** Store `source_url`, `source_name` (site/author), and fetch date; show "Imported from {site}" with a link on the recipe. This is good practice and a goodwill signal, not a legal shield.
5. **Be a polite, honest client.** Identifiable User-Agent with a contact URL; honor `robots.txt` disallow; rate limit; timeouts; no login, no paywall circumvention, no CAPTCHA or bot-wall evasion (the project rules already forbid bypassing CAPTCHAs). Honor `noindex`/`nosnippet`-style publisher signals where present.
6. **Respect takedown.** Provide a contact so a publisher can ask for removal; because imports are private, removal is cheap.
7. **Security, since this is a server-side URL fetch:** block SSRF (private IP ranges, cloud metadata addresses, redirects to them), cap response size and time. Not a legal point, but it is the most likely way this feature hurts you.
8. **ToS and privacy policy language:** tell users imports are for their personal use, that they are responsible for having the right to save what they paste, and that Minced stores a private structured copy.

Verdict: with 1-4 this is a defensible personal-use tool. Without 2 (i.e., if imported recipes became public) it is a content-republishing site and the risk changes category. **Lawyer** if you ever want shared or public imports.

---

## 2. Images: licensing and attribution

Goal stated by the project: accurate photos of the dish that are free to use.

### 2.1 Sources and their obligations

| Source | License | Obligations | Notes |
|---|---|---|---|
| **US federal works** (e.g. photos taken by USDA employees; USDA Photography Services says its photographic images are public domain) <https://www.usda.gov/node/6106> **[P/S]** | Public domain (§ 105) | None legally; credit as courtesy (e.g. "Photo: USDA"). No implying endorsement. | Not every picture on a `.gov` site is a federal work; some are licensed in. Check each image page. |
| **USDA Flickr stream, items tagged "Public Domain Mark"** | PD | Same | Verify the tag per image. **[S]** |
| **Wikimedia Commons** | Per-file: CC0, public domain, CC BY, CC BY-SA, (older GFDL) | CC BY: credit author, link license. CC BY-SA: same plus ShareAlike on *adaptations*. Commons gives per-file attribution text. <https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia> **[P]** | Commons does not warrant the licensing is correct; verify each file. |
| **Openverse** (search tool over CC/PD media) | Per-item | Per license | Openverse itself says it does not verify the licenses it aggregates; click through to the source. **[S]** |
| **Unsplash** | Unsplash License (not CC0) | No attribution required; **no compiling photos to replicate a competing service**. <https://help.unsplash.com/en/articles/2612331-why-can-t-i-compile-photos-from-unsplash-to-replicate-a-similar-or-competing-service> **[P]** | Also restricts bulk scraping/AI-style compilation. Fine for a few dozen hand-picked images; not for an automated bulk pull. |
| **Pexels** | Pexels License (not CC0, except items individually marked CC0) | No attribution required; cannot sell unmodified, cannot compile to compete. **[S]** | Same caution. |
| **AI-generated images** | US: purely AI-generated imagery is not copyrightable (Copyright Office position, *Thaler v. Perlmutter*) **[M]** | EU AI Act Art. 50(2) puts a machine-readable marking duty on the *provider* of the generator. | See 2.3: do not present as the real dish. |
| **User uploads** (later; out of v1) | User retains copyright | You need a license grant in the ToS plus DMCA process (Section 5) | Defer. |

### 2.2 CC BY-SA obligations in practice

- You must give: author (as named), title, source link, license name and link, and indicate changes (crops, resizes, filters count as changes) **[S/P]**.
- **ShareAlike** applies to the *adapted image*, not to the surrounding page, per the generally accepted reading (a page containing a CC BY-SA photo is a "collection", not an adaptation) **[M]**. The conservative route: **prefer CC0, public domain and CC BY** images and avoid CC BY-SA unless the image is clearly worth it. If you crop/color-grade a BY-SA image, the cropped version must itself be offered under BY-SA with the notice.
- Attribution must be **findable from where the image appears**: a visible caption or a link such as "Photo credits" on the recipe page, plus a site-wide `/credits` page. Footnotes that nobody can reach do not count.

### 2.3 Accuracy, deception and people

- "Accurate photo of the food" has a legal edge: a photo that misrepresents the dish (stock photo of a different dish, or an AI image shown as the real result) risks FTC Act § 5 deceptive-practices exposure if it affects purchase/usage decisions, and is just bad faith with users. Rule: **every image must be a real photo of that dish or clearly labeled "illustration"/"serving suggestion"**; never present an AI-generated picture as the cooked result. **[M, best practice]**
- Avoid identifiable people in photos (right of publicity, model-release issues) unless the license/model release is explicit. Prefer plated-food-only shots.
- Keep **per-image provenance**: store `image_url`, `image_source_url`, `image_author`, `image_license`, `image_attribution_text`, `image_retrieved_at`. (Schema addition for the integrator; not built here.)
- Host the files yourself (Supabase Storage or build assets) rather than hotlinking, and keep original license text with each.

---

## 3. USDA MyPlate and FoodData Central: attribution and no-endorsement

- **FoodData Central (FDC):** data is public domain, published under **CC0 1.0**; no permission needed; USDA *requests* that you cite FoodData Central as the source. Suggested citation: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov." <https://fdc.nal.usda.gov/index.html> and API guide <https://fdc.nal.usda.gov/api-guide.html> **[P]**. USDA also asks to be told about products that use the data (a request, not a condition). The API key has its own terms of use on the api.data.gov signup; keep it server-side (the project already forbids secrets client-side) and honor its rate limits **[M]**.
- **MyPlate recipes:** attribute the source and MyPlate.gov as USDA requests for partner resources **[P]** even though attribution is not a legal condition of public-domain material. Suggested footer on each USDA recipe: *"Recipe adapted from USDA MyPlate Kitchen. Source: {source_url}. Minced is not affiliated with or endorsed by USDA."*
- **No endorsement:** USDA policy is not to endorse any commercial enterprise, product or publication, and using its materials is not an endorsement **[P]**. DietaryGuidelines.gov likewise forbids implying endorsement and notes some materials are copyrighted or personal-use only **[P]**.
  - Do not use the **USDA symbol/logo**; permission is required **[P]**. Do not place the MyPlate icon or USDA marks in Minced's branding, OG images or app icon.
  - If Minced *modifies* a recipe (normalizes units, rewrites steps), say "adapted from", not "by USDA". USDA has not reviewed the modified version.
  - Nutrition values that Minced recomputes (M1.5.4) should be labeled "estimated, based on USDA FoodData Central", not "USDA-certified".
- **Where it goes:** per-recipe source line, a site-wide `/credits` (attributions) page, and the footer link. See checklist.

---

## 4. Privacy

### 4.1 Which laws bite a small site

| Law | Trigger | Does it apply to Minced? |
|---|---|---|
| **CalOPPA** (Cal. Bus. & Prof. Code § 22575) | A commercial website/online service that collects personally identifiable information from California residents must conspicuously post a privacy policy covering: categories of PII collected and categories of third parties it is shared with; how users can review/change their info; how material changes are notified; effective date; how the site responds to Do Not Track signals; whether third parties may track users across sites. Fine can reach $2,500 per violation; a 30-day cure period applies after notice. <https://california.public.law/codes/ca_bus_and_prof_code_section_22575> **[P/S]** | **Yes, from M4.1** (email addresses, Google profile data). No revenue or user threshold. A site reachable from California is covered even if you live elsewhere. |
| **CCPA / CPRA** | A for-profit "business" doing business in California that meets **one** of: annual gross revenue over **$26,625,000** (inflation-adjusted; next adjustment 1 Jan 2027); buys, sells or shares personal information of **100,000+** California residents/households per year; derives **50%+** of revenue from selling/sharing PI. **[S]** (vendor and law-firm summaries; confirm at the CPPA/AG sites). | **Almost certainly not at launch** (no revenue, far below 100k). Write the policy to CCPA standard anyway because it costs nothing and covers you if you grow. Re-check when you approach 100k California users or add ads (ads = "sharing"). |
| **Other US state privacy laws** (Virginia, Colorado, Connecticut, Texas, etc.) | Mostly ~100,000 consumers thresholds; Texas has no volume threshold but exempts SBA-defined small businesses **[M]**. | Likely exempt at small scale; same "write once to the strictest standard" approach. **Lawyer** to confirm Texas. |
| **GDPR / UK GDPR** | Applies to a non-EU controller if it offers goods/services to people in the EU/UK (Art. 3(2)(a)) or monitors their behavior (Art. 3(2)(b)). Merely being *accessible* from the EU is not enough; evidence of targeting (EU languages, euro pricing, EU marketing) is. **[M]** | An English-only US recipe site with no EU marketing is a weak target, but global SEO traffic and a Google sign-in make some EU users certain. Practical stance: implement the cheap GDPR basics (lawful basis, rights process, DPAs, no unnecessary data) and do not market to the EU. If you ever target the EU, you may need an **Art. 27 EU/UK representative**. |
| **COPPA** | Operators of sites *directed to children under 13* or with *actual knowledge* they collect data from under-13s. Amended rule effective 2025-06-23, compliance date **2026-04-22** (already passed) **[P]** <https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule> | Minced is a general-audience site (not directed to kids), but recipes appeal to teens. See 4.5. |
| **CAN-SPAM** | Commercial email. | Auth emails (verification, reset) are transactional and exempt from most rules. If you ever send a newsletter: include a physical postal address and a working unsubscribe. **[M]** |

### 4.2 Privacy policy: what it must say for Minced

Draft the policy against the actual data map, not a template. Minimum content:

1. Who you are, contact email, and (for CalOPPA/GDPR) a postal address or a way to reach you.
2. **Data collected:** email, password hash (Supabase Auth), Google account name/email/avatar (if Google sign-in), favorites, user-created recipes, saved pantry (when it moves from URL params to saved state), IP address and device data in server logs, error reports (Sentry), analytics events (PostHog).
3. **Why** and **lawful basis** (GDPR): contract (account), legitimate interests (security, error monitoring), consent (non-essential analytics cookies where required).
4. **Who receives it** (processors): Supabase (database/auth), Vercel (hosting), Google (OAuth), Sentry, PostHog, the Anthropic API only if a user-facing AI feature ever sends user data. Link their DPAs. Supabase's DPA incorporates the EU SCCs by reference (Commission Decision 2021/914) and treats acceptance of its terms as equivalent to signing **[S/P]**: <https://supabase.com/legal/customer-resources/data-processing-addendum>. Vercel's DPA applies where GDPR-covered data is processed and may be tied to a paid plan or executed agreement; check the current text and the plan you use **[S]**: <https://vercel.com/legal/dpa>.
5. **Retention** and **deletion**; user rights (access, deletion, correction, portability; and for California, opt-out of sale/sharing and non-discrimination); how to exercise them; appeal route.
6. **Do Not Track / Global Privacy Control** statement (CalOPPA requires saying whether you honor DNT; CCPA regulations require honoring GPC *if* you sell/share). Simplest honest position: "We do not sell or share personal information, and do not use cross-site tracking," then honor GPC and DNT by disabling PostHog when either signal is present (cheap to implement).
7. Children: not directed to under-13s (see 4.5).
8. International transfers: data stored in the US (Supabase region); SCC/DPF basis.
9. Effective date, how changes are announced (CalOPPA requirement).
10. **Google user data section.** Google's OAuth verification and API-services policy require a policy that accurately describes how you use Google user data. State that you use the Google account only to sign the user in, store only email/name/avatar, and never sell or use it for ads.

### 4.3 Cookies and consent banners

- **Supabase Auth cookies** (session/refresh tokens set by `@supabase/ssr`): these exist only to keep the user signed in at their request. In the EU/UK, ePrivacy Art. 5(3) exempts storage "strictly necessary" to provide a service the user explicitly requested; regulators (e.g. CNIL, Article 29 WP Opinion 04/2012) treat authentication and session cookies as exempt **[S]**. **No consent banner is needed for auth-only cookies.** Document them in the policy (name, purpose, duration).
- **Anything else changes the answer.**
  - **PostHog** (planned Phase 6): the default configuration stores an identifier in cookies/localStorage and tracks across sessions. That needs opt-in consent in the EU/UK. Options, in order of simplicity: (a) run it cookieless/in-memory with no persistent identifier and no PII (then no banner in most readings, though CNIL-style audience-measurement exemptions are narrow and I could not verify current conditions **[S/M]**); (b) enable it only after consent for EU/UK visitors; (c) skip product analytics for v1 and use Vercel's cookieless analytics. Recommend (a) or (c) for launch; this lets Minced ship **without a cookie banner**.
  - **Sentry:** error reporting is a legitimate-interest, security/functionality use; disclose it; scrub PII (no emails, no IPs beyond what is needed) **[M]**.
  - **Google Fonts, embedded YouTube, social widgets, ads:** third-party requests expose IP addresses; a German court has penalized Google Fonts hotlinking under GDPR **[M]**. `next/font` self-hosts fonts at build time, so keep using it and avoid third-party embeds.
- **If you do add a banner:** equal-weight accept/reject buttons, no pre-ticked boxes, nothing non-essential fires before consent, a way to withdraw, and decline non-essential by default (matches the project's privacy stance). In the US a banner is not required by law, but the policy must disclose tracking.
- UK: the Data (Use and Access) Act 2025 loosened some PECR cookie rules for low-risk analytics **[M]**; verify before relying on it.

### 4.4 Account deletion and data export

- **Legal basis:** GDPR Art. 17 (erasure) and Art. 20 (portability); CCPA/CPRA right to delete and right to know/portability; CalOPPA requires describing how users review and change their data **[M]**.
- **Platform rules (if a mobile app follows):** Apple App Review Guideline 5.1.1(v) requires in-app account deletion for apps that support account creation (deactivation alone does not suffice; a link to a web page that completes deletion is allowed; do not require phone, email or chat support) <https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion> **[P]**. Google Play has an equivalent data-deletion requirement **[M]**.
- **What to build (M4.3, Settings tab):** (1) "Delete my account" that removes the auth user and cascades: profile, favorites, saved pantry, drafts; (2) decide what happens to **published user recipes**: delete them, or anonymize and keep (`author_id` set null) only if the ToS says so and the user chose it; (3) "Download my data" (JSON of profile, favorites, my recipes). The M1.2 schema's `author_id` FK behavior must be checked for cascade vs. set-null. Provide a 30-day completion promise and backups-purge note in the policy.
- Verify deletion by counting rows afterwards (the project already has this rule), per the RLS test plan.

### 4.5 Children (COPPA and teen data)

- COPPA reaches sites **directed to children** or with **actual knowledge** of collecting from under-13s **[P]**. Minced is a general-audience site.
- Cheap safe posture: ToS and policy say "Minced is not for children under 13"; do not ask for a date of birth (asking is how you acquire knowledge); if you learn an account belongs to a child under 13, delete it promptly. GDPR Art. 8 sets 13-16 (country-specific) as the age of digital consent; the same "13+" line is common practice **[M]**.
- If you later add features attractive to kids (a "kid-friendly" collection is fine; a kids' mode with accounts is not), re-evaluate.

---

## 5. Terms of service, user-generated recipes, DMCA

### 5.1 Terms of service (needed at M4.1)

Not legally mandatory for a read-only site, but **effectively required once accounts and user content exist** because it is your contract with users and your liability limit. Include: eligibility (13+); account responsibility; acceptable use (no illegal or infringing content, no scraping of Minced, no abuse); **license to user content** (the user keeps ownership; grants Minced a worldwide, non-exclusive license to host, display and adapt it to run the service); **content rules and removal rights**; DMCA policy (5.2); **disclaimers** (as-is; nutrition, allergen and food-safety, section 8); limitation of liability and indemnity (enforceability varies; **Lawyer**); governing law and venue (your state); optional arbitration and class waiver; changes to terms; contact. Present with a checkbox at signup ("I agree to the Terms and Privacy Policy", links, not pre-checked) so assent is clickwrap, not browsewrap.

### 5.2 Digital Millennium Copyright Act safe harbor (needed before M5 publishes user content)

- **Why:** 17 U.S.C. § 512(c) shields a service provider from monetary liability for user-posted infringing material if it meets conditions. Section 230 does **not** protect against intellectual-property claims (§ 230(e)(2)) **[M]**, so DMCA is the shield that matters for user recipes (and for any user-uploaded photos later).
- **Conditions [M, from the statute; verify at <https://www.copyright.gov/512/>]:**
  1. **Register a designated agent** with the Copyright Office's online DMCA Designated Agent Directory (<https://www.copyright.gov/dmca-directory/>) and put the agent's name, address and email on your site. Registration must be **renewed at least every three years** or it lapses and the safe harbor is lost; the fee has been **$6 per designation** (sources date from 2016-2017; confirm current fee) **[P/S]**: <https://www.copyright.gov/onlinesp/tutorials/transcripts/renew.pdf>. As a solo dev, use a role mailbox such as `copyright@yourdomain` and a postal address you are willing to publish (a PO box or registered-agent address works).
  2. **Adopt and reasonably implement a repeat-infringer policy** (terminate accounts of users who are repeatedly found infringing) and tell users about it in the ToS.
  3. **Takedown flow:** accept notices that comply with § 512(c)(3) (identify the work, identify the material, contact details, good-faith statement, accuracy statement under penalty of perjury, signature); remove or disable access **expeditiously**; notify the user; honor a counter-notice (restore after 10-14 business days unless the claimant sues). Provide a web form or email address. Keep a log.
  4. No actual knowledge of specific infringement, and no financial benefit directly attributable plus right and ability to control (the "red flag" and "control" tests).
  5. Don't ignore standard technical measures.
- **Minced-specific recipe risk:** user recipes copied from cookbooks or blogs are the realistic infringement vector. Add a "Report a problem with this recipe" link on every user-authored recipe (also supports DSA, below) and a submit-time reminder: "Only submit recipes you wrote or have the right to share."
- **Imports:** the private blog-URL import in 1.4 keeps copied-from-elsewhere content out of the public side. Keep it that way.

### 5.3 EU Digital Services Act (if EU users and user-hosted content)

Hosting user content makes you a "hosting service" under the DSA. Minimums: a **single point of contact** for authorities and one for users, with a human reachable (Arts. 11-12), and an **easy electronic notice-and-action** mechanism with an acknowledgment and a reasoned decision (Art. 16). Micro/small enterprises are exempt from transparency reporting (Art. 15(2)) and from the extra online-platform duties (Arts. 19-28), but sources indicate they still need the Art. 16 mechanism **[S]**; read the regulation text (Reg. (EU) 2022/2065) before relying on it. One `legal@` mailbox plus a report form serves DMCA, DSA and general complaints.

---

## 6. Nutrition and allergen disclaimers

- Minced is **not** a food seller, so FDA packaged-food labeling and health-claim rules do not directly govern recipe pages, but the FTC Act bars false or misleading claims **[M]**, and negligence/failure-to-warn exposure is real where allergen filters exist.
- **Nutrition:** show as **estimates** ("per serving, estimated from USDA data"). Ingredient brands, trimming and cooking method change values. Do not say "healthy", "low-carb", "diabetic-friendly" or make any disease claim without a defined, honest rule (e.g., "contains no ingredients tagged X"). Disclaimer: "Not medical or dietary advice. Consult a qualified professional, especially if you are pregnant, managing a medical condition, or on a prescribed diet."
- **Allergens:** Minced derives allergens from canonical ingredients (`SCHEMA-NOTES`), so it is only as accurate as the ingredient resolution; it cannot see the brand of soy sauce, "may contain" statements, or cross-contact. Required copy wherever the allergen filter or allergen chips appear: *"Allergen information is derived from listed ingredients and may be incomplete or wrong. It does not account for brands, processing, or cross-contact. Always read the labels of the products you buy, and do not rely on Minced if you have a serious allergy."* Never use "allergen-free" or "safe for"; use "does not list X". Show the nine major allergens defined in US law (milk, egg, fish, shellfish, tree nuts, peanuts, wheat, soy, sesame) **[M]** consistently; the optional-egg question for Miso Mushroom Ramen should default to *showing* the allergen (the safe direction).
- **Food safety:** steps must state safe internal temperatures for meat, poultry, eggs, and reheating. The AI-draft pipeline (M1.5.5) must be checked for this; an AI-hallucinated cook time is a safety defect, not a typo.
- Link the full disclaimer from the footer and from the filter UI; repeat a one-line version near allergen chips.

---

## 7. AI disclosure

The user asked specifically whether AI-written recipes and AI features need disclosure. Short answer: **no law found that clearly requires Minced to label LLM-drafted, human-reviewed recipes today, but a visible label is strongly recommended and cheap**, and several laws will matter the moment Minced adds a *user-facing* generative feature or AI imagery.

### 7.1 EU AI Act, Article 50 (transparency)

Text of Art. 50 <https://artificialintelligenceact.eu/article/50/> **[P]**:

- **50(1):** providers must design AI systems that interact directly with people so people are told they are interacting with AI (unless obvious). Applies to a **chatbot-style feature**, if Minced ever adds one.
- **50(2):** providers of AI systems that generate synthetic audio/image/video/text must make outputs **marked in a machine-readable format and detectable as AI-generated**. This is a duty of the **provider of the generating system** (the model/API vendor, or you if you build and offer a generation feature), not of a downstream site that publishes a few reviewed recipes. If Minced exposes a generator to the public, you may become a "provider".
- **50(4):** *deployers* of AI that generates or manipulates **deep fakes**, or **text published to inform the public on matters of public interest**, must disclose it; the text duty is **lifted where the content has undergone human review/editorial control and a person holds editorial responsibility**. A recipe is not plausibly "matters of public interest" text, and Minced's recipes are human-reviewed with Minced as the responsible publisher. So 50(4) text duty very likely does not apply.
- **50(5):** disclosures must be clear, given at first interaction/exposure, and meet accessibility requirements.
- **Dates:** per law-firm commentary, Art. 50 transparency duties **began applying 2 August 2026**; the "Digital Omnibus" (reported as Regulation (EU) 2026/1744, in force 27 July 2026) delayed the *high-risk* rules (to 2 Dec 2027 / 2 Aug 2028) but left Art. 50 untouched, with a grace period to **2 December 2026** for Art. 50(2) marking for generative systems already on the market before 2 Aug 2026. Fines for Art. 50 breaches up to €15M or 3% of worldwide turnover **[S: Goodwin, Ropes & Gray, Houthoff summaries; one source's wording is ambiguous; verify against the Official Journal text]**: <https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force>, <https://www.houthoff.com/insights/news/ai-act-transparency-obligations-and-the-ai-omnibus-regulation/>.
- **Applicability to Minced:** the Act has extraterritorial reach when output is used in the EU **[M]**, but for a US site that only publishes reviewed text recipes, the realistic exposure is low. It becomes real if Minced adds (a) a chat assistant, (b) AI-generated images or (c) a "generate me a recipe" feature.

### 7.2 California AI Transparency Act (SB 942, amended by AB 853)

- Covers a "covered provider": a person who creates or produces a **generative AI system with over 1,000,000 monthly visitors or users**, publicly accessible in California, that generates **image, video or audio** (not text). Duties: a free AI-detection tool plus latent and manifest disclosures; $5,000 per violation per day, enforceable by the AG and local counsel **[S]**. AB 853 (chaptered 2025-10-13) phased in later duties for large platforms and hosting platforms (1 Jan 2027) and capture devices (1 Jan 2028); one source gives 2 Aug 2026 as the covered-provider date, a date I could not corroborate **[S]**. Sources: <https://www.sidley.com/en/-/media/resource-pages/ai-monitor/laws-and-regulations/cal-ab853-california-ai-transparency-act.pdf?la=en>, <https://calmatters.digitaldemocracy.org/bills/ca_202520260ab853>.
- **Minced:** not a generative-image provider and far under 1M users; text-only content is excluded. **Not applicable.** Re-check if Minced ever generates images.

### 7.3 FTC

- Section 5 of the FTC Act prohibits deceptive practices. The FTC's *Operation AI Comply* (announced 2024-09-25) targeted deceptive AI claims and AI-enabled fraud, with the long-standing rule that AI claims must be substantiated **[S]**. Its Consumer Reviews and Testimonials rule bars fake or AI-fabricated reviews presented as real **[S]**.
- **Minced implications:** (1) never claim recipes were "chef-tested", "kitchen-tested" or "tested by our team" unless they were; (2) never generate fake reviews, ratings or "cooks like you" quotes; (3) don't oversell the AI ("AI nutritionist"); (4) if material to users' decisions, say AI was involved. Disclosure is material-fact-driven, not a blanket rule **[S]**.

### 7.4 Other US states

- **Utah** AI Policy Act: gen-AI disclosure to consumers only when asked ("clear and unambiguous request") for most businesses after the 2025 narrowing **[S]**.
- **Colorado** AI Act: delayed to 30 June 2026, then reportedly rewritten (SB 26-189, effective 1 Jan 2027) into a narrower automated-decision law; about consequential decisions (credit, housing, employment), not recipes **[S; unconfirmed whether signed]**. Not applicable.
- State laws on AI chatbots disclosure and "synthetic media" in elections are not relevant to recipes **[M]**.

### 7.5 Copyright status of AI-written recipes

The US Copyright Office's position (AI report, 2025) is that purely AI-generated material is not copyrightable, and human authorship is required **[M]**. For Minced: (a) don't assert copyright over LLM-drafted recipes beyond what your human edits add (the ToS "all rights reserved" line should say "except content in the public domain or licensed by others"); (b) the functional recipe is uncopyrightable anyway (section 1), so this costs little; (c) verify the LLM provider's terms allow commercial use of outputs.

### 7.6 Apple App Store (if an iOS app is built later)

- **5.1.2(i), updated 2025-11-13:** you must clearly disclose where personal data will be shared with third parties, **including third-party AI**, and obtain **explicit permission** first **[S]** (TechCrunch coverage: <https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai>; Apple's guideline page: <https://developer.apple.com/app-store/review/guidelines/>). Triggers if user data is sent to an LLM API at runtime. The current design (AI used offline to author recipes) sends no user data.
- **1.2 User-generated content:** needs content filtering, a report mechanism with timely response, the ability to block abusive users, and published contact information **[S]**. Applies when M5 user recipes exist in an app.
- **5.1.1(v):** in-app account deletion (4.4).
- **Privacy "nutrition label"** (App Privacy details) and a privacy-policy URL are required at submission **[M]**. Apple does not currently require a generic "this content was written by AI" badge for recipes **[M]**; verify the guideline text when the time comes.

### 7.7 Recommendation (concrete)

| Item | Required? | Recommendation |
|---|---|---|
| Label LLM-drafted, human-reviewed recipes | **Not clearly required** (EU 50(4) excepts human-reviewed text; recipes aren't public-interest text; SB 942 is images/audio and >1M users) | **Do it anyway (best practice).** Add `authorship` enum to recipes (`usda_adapted`, `minced_ai_assisted`, `user`, `imported_private`). Show a small, non-alarming badge: **"Drafted with AI, reviewed and edited by Minced."** with a "How we make recipes" link. Honest, builds trust, future-proofs against EU/State rules and platform policy, and supports FTC substantiation. |
| Do not claim "tested by humans" unless true | **FTC deception rule** | Don't. |
| AI-generated images | If used: EU 50(2)/(4) marking and deep-fake disclosure; deceptive if presented as the real dish | Don't use AI imagery as recipe photos. If ever used, label "Illustration (AI-generated)" and keep C2PA/metadata marks. |
| Any user-facing AI feature (chat, substitution assistant, "generate a recipe") | **Yes: EU 50(1)** disclosure that the user is talking to AI; Apple 5.1.2(i) consent if data goes to a third-party AI; privacy-policy disclosure of the AI processor | Gate behind a milestone, add "AI" labeling in the UI, consent before first send, and do not log prompts with PII. |
| Machine-readable marking of AI text | Provider duty (EU 50(2)); not Minced's unless it offers a generator | Store provenance in the DB; add a `meta` or JSON-LD note is optional. |
| AI policy page | Not required | A short `/about/how-recipes-are-made` page covering USDA sourcing, AI drafting and human review, and corrections. Doubles as the AI label target. |

---

## 8. Accessibility

- **No federal web-accessibility regulation yet for private businesses.** DOJ's April 2024 Title II rule names **WCAG 2.1 Level AA** for state and local governments (an interim final rule in April 2026 reportedly pushed deadlines to 26 April 2027 / 2028 **[S]**). Courts in ADA Title III website cases treat WCAG 2.1 AA as the de facto benchmark; federal Title III website suits reached roughly 3,100 in 2025 **[S]**; California adds state-law exposure (Unruh Act) **[S/M]**. Whether an online-only business is a "place of public accommodation" differs by circuit **[M]**.
- **European Accessibility Act**, applicable since 28 June 2025, covers consumer e-commerce services; **microenterprises that provide services are exempt** (fewer than 10 staff and ≤ €2M turnover) **[M]**. A free recipe site is unlikely to be in scope; verify if you monetize in the EU.
- **Plan:** treat WCAG 2.1 AA as the acceptance bar for the Phase 2 design system and M3 pages: color contrast tokens checked in both themes (CLAUDE.md requires colours from CSS variables), keyboard operability of the pantry input and filters, visible focus, labels on every form control, alt text policy for recipe images (a short factual description; empty alt for pure decoration), no information by color alone (the allergen chips need icons or text), `prefers-reduced-motion`, respect zoom to 200%. BUILD-PLAN already gates Lighthouse accessibility ≥ 90; add an automated axe check in CI and a manual keyboard-only and screen-reader pass.
- Publish a short **accessibility statement** (standard targeted, known gaps, a contact for barriers). A feedback channel is the cheapest lawsuit mitigation.

---

## 9. Platform and vendor terms

### 9.1 Vercel Hobby plan: non-commercial only

Vercel's fair-use guidelines limit **Hobby to non-commercial personal use**; commercial use requires Pro or Enterprise. "Commercial" is defined broadly as any deployment used for the *financial gain of anyone involved in producing the project* (a paid developer counts), and the examples include requesting or processing payments, advertising the sale of a product or service, affiliate linking as the primary purpose, and ads such as AdSense; **donations do not count as commercial** **[P/S]**: <https://vercel.com/docs/platform/fair-use-policy>, <https://vercel.com/docs/plans/hobby>.

- Today (free personal portfolio project on `*.vercel.app`) is fine.
- **Move to Pro (≈ $20 per seat per month at time of writing; verify) before** adding ads, affiliate links, paid tiers or sponsorships, or if you launch it as a business or the app helps your paid work (it is also a job-search portfolio piece; that gray area is "ask Vercel support"). Pro is also where a DPA and team features become available **[S]**. BUILD-PLAN's "Payments, subscriptions, anything monetized" cut-list matches this; the checklist places the plan decision at Phase 6.

### 9.2 Google OAuth (M4.1 uses Google sign-in)

- Requesting only the basic scopes (`openid`, `email`, `profile`) avoids the sensitive/restricted-scope review (security assessment and demo video) **[S]**.
- **Brand verification still applies** to apps using Google APIs: a homepage on a domain you own that describes the app and is more than a login page, a privacy policy linked from both the homepage and the consent screen (same URL), and a current Cloud project contact email. Google may withdraw access if you ignore its notices. <https://support.google.com/cloud/answer/13464321> **[P/S]**.
- Practical needs: (1) a **real domain** (a `vercel.app` subdomain you don't own the root of can't be verified in Search Console as an owned domain; buy a domain), (2) the privacy policy and homepage live before switching the consent screen from **Testing** to **In production** (Testing mode has a test-user cap and short-lived tokens **[M]**), (3) authorized redirect URIs match the Supabase callback, (4) follow Google's sign-in button branding.
- Expect the consent screen to show "unverified" warnings until brand verification completes; leave lead time (days to weeks) before launch.

### 9.3 Supabase and Vercel as processors

Record that you accepted each vendor's DPA and where data lives. Keep dated copies of the versions in force **[S]**.

---

## 10. Trademark: "Minced"

### 10.1 Preliminary search (not a clearance opinion)

I could not query the USPTO's live system (tmsearch.uspto.gov is JavaScript-driven and not reachable from the tools here). I used a third-party mirror, Trademarkia, which republishes USPTO records **[S]**: <https://www.trademarkia.com/search/trademarks?query=minced>. Results for the word MINCED and variants (the page listed 11 results but displayed only 10):

| Mark | Owner | Serial | Status | Class | Goods/services | Filed |
|---|---|---|---|---|---|---|
| **MINCED** | **MINCED LLC** | 99938779 | **Live (pending application)** | 030 | Seasonings and seasoning mixes | **14 Jul 2026** |
| CAFE MINCED | Medtrition, Inc. | 97425528 | **Live (registered 20 Feb 2024)** | 029, 030 | Processed foods for healthcare patients | 24 May 2022 |
| MINCED | Sterles Group LLC | 86372229 | Dead (abandoned 2018) | 043 | Bar and restaurant services | 2014 |
| MINCED MARKET | Maximum Garlic Products | 86397887 | Dead (cancelled 2021) | 030 | Minced garlic products | 2014 |
| MINCED IT | Duran, Isabelle | 87002791 | Dead (abandoned 2019) | 035 | Online catering/restaurant information and advertising | 2016 |
| MINCED HERBS | BEASTLYS Ltd. | 97494026 | Dead (abandoned 2023) | 021 | Spice/herb grinders | 2022 |
| (Several 1906-1984 seafood marks) | various | various | Dead | 029 | Minced clams/fish | n/a |

A web search for apps called "Minced" found none, but did find **Mince Meal Prep**, a meal-prep app with a pantry tab, released on the App Store 2026-06-02 **[S]**: <https://mwm.ai/apps/mince-meal-prep/6773754928>. Crowded neighbors in the pantry-recipe category: SuperCook, Half Lemons, Kitchen Pantry Chef, SideChef My Pantry **[S]**.

### 10.2 What this suggests

1. **Weak, descriptive mark.** "Minced" is a common cooking term (to mince). For recipe content it is at least *suggestive* and arguably *descriptive*, which makes it hard to register (USPTO § 2(e)(1)) and gives you narrow enforceable rights. It is easier to register for non-food software, but that is not what Minced is.
2. **A pending, earlier-filed application exists:** MINCED LLC's July 2026 application for the identical word on **seasonings** (class 30). Minced was renamed on 2026-09-16 (per CLAUDE.md), after that filing date, so MINCED LLC has priority on that application's filing date as to *seasonings* (constructive use priority under the Lanham Act § 7(c)) **[M]**. Whether a recipe website/app is "related" to seasonings for likelihood-of-confusion purposes is a real question: food products and food-information services are often argued related, especially with an identical mark. Risk is **moderate, not trivial**: at worst a demand letter or an opposition if Minced files.
3. **Mince Meal Prep** is near-identical in sound and overlaps in function (meal-prep plus pantry). That is a more direct commercial-confusion and app-store-name risk than the class-30 filing.
4. **Registration and use are different.** You can use the name without registering, but you would have no strong rights and no ability to stop a later copycat; also there is no common-law rights search here. Common-law users (unregistered businesses, apps, Etsy shops) are not in the USPTO database.

**Recommended next steps (before spending on a domain, brand identity or app-store listing):**
- Run the free USPTO search yourself (exact and phonetic: MINCED, MINCD, MINSED, MINCE) in classes 9, 41, 42, 43, 45 plus coordinated classes 29/30; check TESS-successor status of 99938779 and who MINCED LLC is.
- Check domain, social handles, App Store and Google Play name availability and the `@minced` namespace.
- **Lawyer**: a flat-fee clearance opinion (typically a few hundred dollars) is worth it if the name is staying. Consider a more distinctive lead mark (e.g. "Minced Kitchen" or a coined name) or a design-led logo as a fallback.
- Don't file your own application until clearance is done; filing fees are non-refundable.

---

## 11. Prioritized checklist mapped to BUILD-PLAN milestones

### Blocks launch (public, indexed, with accounts)

| # | Item | Milestone | Why |
|---|---|---|---|
| 1 | **Source audit of the 872 MyPlate recipes** for non-USDA authorship; `source_license` values accurate | M1.5.7 (before launch) | Public-domain claim is the legal foundation of the catalog. |
| 2 | **Attributions/credits page + per-recipe source line + no-endorsement statement** | M3.2 (recipe detail), M2.3 (footer) | USDA asks for attribution; avoids implied endorsement. |
| 3 | **Privacy policy** (CalOPPA-complete, GDPR-ready, Google-data section) | M4.1 (before auth goes live) | CalOPPA applies as soon as emails are collected; required by Google OAuth brand verification. |
| 4 | **Terms of service** with clickwrap at signup | M4.1 | Governs accounts; needed before user content. |
| 5 | **Real domain** and Google OAuth consent screen in production with homepage + policy links | M4.1 | Google brand verification. |
| 6 | **Allergen/nutrition/food-safety disclaimer** wherever filters or nutrition appear | M3.4 (allergen filter), M1.5.4 | Liability control; text is cheap. |
| 7 | **Cookie posture decided:** auth-only cookies means no banner; PostHog cookieless/consent-gated; policy lists cookies | Phase 6 (PostHog) | Avoids an unnecessary banner and GDPR consent defects. |
| 8 | **Trademark clearance decision** on "Minced" (given the pending MINCED LLC filing and Mince Meal Prep) | Before M6 domain purchase; ideally now | Cheaper to rename before launch than after. |
| 9 | **Account deletion** (cascade) and **data export** in Settings | M4.3 | GDPR/CCPA rights; Apple rule if an app follows. |
| 10 | **Contact mailbox** (`legal@`/`copyright@`) and "Report a problem" link | M4.1/M3.2 | Foundation for DMCA, DSA, takedowns, accessibility feedback. |
| 11 | **Accessibility baseline** (WCAG 2.1 AA, axe in CI, statement) | Phase 2 (tokens/primitives) through Phase 6 | Lawsuit risk and quality; cheaper to build in than retrofit. |

### Required before user-generated content ships

| # | Item | Milestone |
|---|---|---|
| 12 | **DMCA designated agent registered** (renew every 3 years), repeat-infringer policy, takedown + counter-notice flow | M5.2 (publish) |
| 13 | ToS content license, "only submit recipes you have the right to share" reminder, report link on user recipes | M5.1/M5.2 |
| 14 | EU DSA contact point + notice mechanism (if EU users) | M5.2 |
| 15 | Image-rights process for user photos (if the v1 exclusion is ever lifted) | Post-v1 |

### Best practice, ship with launch if cheap

| # | Item | Milestone |
|---|---|---|
| 16 | **AI-assisted recipe label** + `/about/how-recipes-are-made`; `authorship` field; humans-reviewed claim true | M1.5.5/M1.5.6 (store), M3.2 (show) |
| 17 | Honor GPC/DNT; scrub PII in Sentry | Phase 6 |
| 18 | Per-image provenance table; prefer CC0/PD/CC BY photos | When photos are added |
| 19 | Age line "13+" in ToS/policy; no DOB collection | M4.1 |

### Later phases or if features are added

| # | Item | Trigger |
|---|---|---|
| 20 | Private URL-import design rules (section 1.4) | v1.3 or whichever milestone adds import |
| 21 | AI chat/assist feature: Art. 50(1) disclosure, consent before sending data to an AI API, policy update | Any user-facing AI |
| 22 | Vercel Pro upgrade | Ads, affiliate, payments, sponsorship, or business launch |
| 23 | CCPA "Do Not Sell/Share" link, opt-out mechanism | If ads/third-party sharing or 100k CA users |
| 24 | Apple/Google store requirements (5.1.1(v), 1.2, 5.1.2(i), privacy labels) | Mobile app |
| 25 | Revisit CAN-SPAM (newsletter), EU representative, GDPR DPIA | Newsletter / EU targeting |

---

## 12. Pages and components needed (not built here)

| Item | Type | Content | Appears |
|---|---|---|---|
| `/privacy` | Page | Section 4.2 contents | Footer; signup; Google consent screen |
| `/terms` | Page | Section 5.1 | Footer; signup checkbox |
| `/credits` (attributions) | Page | USDA MyPlate + FoodData Central statement, no-endorsement line, image credits by recipe, open-source licenses | Footer; recipe pages |
| `/dmca` (copyright policy) | Page | Agent contact, takedown and counter-notice instructions, repeat-infringer policy | Footer (M5) |
| `/accessibility` | Page | Standard, known gaps, feedback contact | Footer |
| `/about/how-recipes-are-made` | Page | Sourcing, AI drafting plus human review, corrections | Linked from AI badge |
| `/disclaimer` (or section of terms) | Page | Nutrition, allergen, food safety, not medical advice | Linked near filters and nutrition |
| `<SourceAttribution>` | Component | "Adapted from USDA MyPlate Kitchen" + link; not-endorsed line; adapts for other sources | Recipe detail |
| `<AiAuthorshipBadge>` | Component | "Drafted with AI, reviewed and edited by Minced" + link; keyed off `authorship` | Recipe card/detail |
| `<ImageCredit>` | Component | Author, license, link, "changes made" | Wherever an image is shown |
| `<AllergenDisclaimer>` | Component | One-line + link to full | Near allergen filter/chips |
| `<NutritionNote>` | Component | "Estimated from USDA FoodData Central; not medical advice" | Nutrition block |
| `<ReportRecipeLink>` | Component | Opens a form: copyright, safety, wrong info | Every recipe, M5 |
| Signup consent line | Form text | Terms + Privacy checkbox, "13 or older" | `/signup` |
| Account settings: delete + export | UI | Section 4.4 | `/account` Settings |
| Cookie notice | Conditional component | Only if non-essential analytics for EU/UK | Phase 6 |
| `.well-known/security.txt` | File | Contact for vulnerabilities | Optional |

Schema additions suggested for the integrator (not done here): `recipes.authorship`, image provenance columns or an `images` table, `profiles.terms_accepted_at`/`terms_version`, `takedown_requests` log, and `visibility` for private imports.

---

## 13. Open questions for the owner (Kevin)

1. Is Minced a **business** (ever to be monetized or tied to income) or a **portfolio/hobby** project? That decides Vercel Pro timing and CCPA/Texas analysis.
2. Are you willing to **publish a postal address or PO box** (CalOPPA/DMCA agent)?
3. Is the **name Minced** staying given the pending MINCED LLC filing and Mince Meal Prep? If yes, book a clearance review.
4. Do you want the AI label shown on **every** AI-drafted recipe (recommended) and a `/about` page explaining it?
5. Should user-generated recipes (M5) be **publicly visible** at launch, or can v1 ship with private recipes only (which defers DMCA/DSA work)?
6. Do you want **any EU/UK marketing**? If not, say so in the policy and keep the GDPR work at the basics.

---

## Sources

Fetched or surfaced by search this session. [P] = primary or regulator/platform page; [S] = secondary.

- US Copyright Office, Circular 33: <https://www.copyright.gov/circs/circ33.pdf> [P]
- *Publications Int'l v. Meredith*, 88 F.3d 473: <https://inns.innsofcourt.org/media/129123/Publ_ns%20Int_l_%20Ltd.%20v.%20Meredith%20Corp._%2088%20F.3d%20473.pdf> [P]
- NYC Bar, Secret Ingredients: How to Protect Recipes: <https://www.nycbar.org/wp-content/uploads/2023/05/20221024-SecretIngredientsHowtoProtectRecipes_FINAL_22.6.6.pdf> [S]
- EU AI Act Art. 50: <https://artificialintelligenceact.eu/article/50/> [P]
- Goodwin, EU AI Act transparency obligations: <https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force> [S]
- Houthoff, AI Act transparency and the Omnibus: <https://www.houthoff.com/insights/news/ai-act-transparency-obligations-and-the-ai-omnibus-regulation/> [S]
- Sidley, California AI Transparency Act (AB 853): <https://www.sidley.com/en/-/media/resource-pages/ai-monitor/laws-and-regulations/cal-ab853-california-ai-transparency-act.pdf?la=en> [S]
- CalMatters Digital Democracy, AB 853: <https://calmatters.digitaldemocracy.org/bills/ca_202520260ab853> [P-ish]
- Copyright Office, DMCA agent renewal: <https://www.copyright.gov/onlinesp/tutorials/transcripts/renew.pdf>, directory <https://www.copyright.gov/dmca-directory/> [P]
- Vercel Fair Use Guidelines: <https://vercel.com/docs/platform/fair-use-policy>; Hobby plan: <https://vercel.com/docs/plans/hobby> [P]
- Google, OAuth verification requirements: <https://support.google.com/cloud/answer/13464321> [P]
- CalOPPA § 22575: <https://california.public.law/codes/ca_bus_and_prof_code_section_22575> [S]
- COPPA amended rule (Federal Register): <https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule> [P]
- Jackson Lewis, CCPA applicability: <https://www.jacksonlewis.com/insights/navigating-california-consumer-privacy-act-30-essential-faqs-covered-businesses-including-clarifying-regulations-effective-1126> [S]
- Hunton on CNIL cookie guidance (strictly necessary cookies): <https://www.hunton.com/privacy-and-cybersecurity-law-blog/2013/12/18/french-data-protection-authority-issues-guidance-cookie-consent-expiration/> [S]
- DSA notice-and-action overview: <https://prighter.com/resources/laws/dsa/articles/article-16> [S]
- Supabase DPA: <https://supabase.com/legal/customer-resources/data-processing-addendum>; Vercel DPA: <https://vercel.com/legal/dpa> [P]
- Apple, account deletion: <https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion>; App Review Guidelines: <https://developer.apple.com/app-store/review/guidelines/>; TechCrunch on 5.1.2(i): <https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai> [P/S]
- USDA FoodData Central: <https://fdc.nal.usda.gov/index.html>, <https://fdc.nal.usda.gov/api-guide.html> [P]
- MyPlate About / partner resources: <https://myplate-prod.azureedge.us/about-us>, <https://myplate-prod.azureedge.us/partner-resources> [P]
- USDA photography: <https://www.usda.gov/node/6106> [P]
- Wikimedia Commons reuse: <https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia> [P]
- Unsplash license compiling restriction: <https://help.unsplash.com/en/articles/2612331-why-can-t-i-compile-photos-from-unsplash-to-replicate-a-similar-or-competing-service> [P]
- Scraping law overview (Haynes Boone): <https://www.haynesboone.com/news/publications/the-shifting-legal-landscape-surrounding-web-scraping.pdf> [S]
- FTC Operation AI Comply (Davis Polk summary): <https://www.davispolk.com/insights/client-update/ftc-announces-new-enforcement-initiative-targeting-deceptive-ai-practices> [S]
- Trademarkia search for MINCED: <https://www.trademarkia.com/search/trademarks?query=minced> [S]; Mince Meal Prep listing: <https://mwm.ai/apps/mince-meal-prep/6773754928> [S]
- ADA/WCAG context: <https://www.boia.org/blog/justice-departments-final-rule-for-title-ii-ada-compliance> [S]
