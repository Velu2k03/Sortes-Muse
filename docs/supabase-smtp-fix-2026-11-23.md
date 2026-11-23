# B1: "Error sending confirmation email" on email-link sign-in (2026-11-23)

Status: **config-only. No code change.** The fix is a Supabase dashboard
step that has to be done by hand (this VM has no Supabase dashboard
access, no management token, and direct DB connections are off).

## What produces the error

- The only Supabase Auth email call in `src` is
  `supabase.auth.signInWithOtp` in `src/app/account/AccountClient.tsx`
  (the "email me a link" button). The error text is Supabase's own
  message, passed through unchanged (`throw new Error(error.message)`).
- No other Supabase email path exists: no `signUp`,
  `resetPasswordForEmail`, `inviteUserByEmail` or `generateLink` in `src`.
  `/api/auth/signup` is the app's own password signup and sends no
  Supabase mail. The app's own emails (nudges, credit notices) go
  through Resend directly from `src/lib/email.ts`, not through Supabase.
- `signInWithOtp` defaults to `shouldCreateUser: true` (auth-js
  types). Supabase Auth sends a **confirmation** email to a new or
  unconfirmed address and a **magic-link** email to a confirmed one.
  "Error sending confirmation email" therefore means that Supabase's
  mailer failed to send to a new or unconfirmed address.
- It is **not** the email rate limit. A rate limit has its own error
  code, `over_email_send_rate_limit` (listed in
  `node_modules/@supabase/auth-js/dist/main/lib/error-codes.d.ts`), and
  its own message, "email rate limit exceeded". The default
  provider's team-only restriction is also its own code,
  `email_address_not_authorized`. A generic send failure is what's left.

## Evidence (Resend API, read-only, 2026-11-23)

These checks used the Resend connector helper (GET `/emails`,
GET `/emails/{id}`, GET `/api-keys` metadata, GET `/domains`). No mail
was sent. Recipient addresses were masked, and only link hostnames
were read from the bodies (no tokens).

| What | Finding |
|---|---|
| Domains | `sortes.resonantatlas.com` and `resonantatlas.com` are both **verified**, sending enabled |
| Supabase-sent mail at Resend | 17 Supabase Auth emails, 2026-11-07 to 2026-11-10 ("Your sign-in link", "Confirm your email address", "Reset your password"), From `"Sortes" <noreply@sortes.resonantatlas.com>`, all **delivered** |
| Production project | Links point at the production Supabase project (ref `adgput…`), redirect to `sortes.resonantatlas.com`. **Last one: 2026-11-10 13:41 UTC** |
| Staging project | Links point at the staging project (ref `rztk…`), redirect to `*.vercel.app` previews. **Last one: 2026-11-10 13:47 UTC** |
| Since 2026-11-10 | **Zero** Supabase mail has reached Resend. Everything after that is the app's own direct sends (2026-11-21, 2026-11-22) |
| API keys (metadata only) | Key "Sortes1": last used **2026-11-10 13:47:39 UTC**, the exact second of the last Supabase mail, so it was the SMTP password. Key "Sortes Production SMTP" was created **2026-11-10 16:08 UTC**, after the last Supabase mail. Its later uses (2026-11-22 02:31) match the app's direct sends, not Supabase |

**Diagnosis.** Custom SMTP through Resend worked for both Supabase
projects until 2026-11-10. After that, every Supabase Auth send fails
before it reaches Resend: the live failures on 2026-11-22 left no
record at Resend at all. That pattern fits a changed or broken
Supabase SMTP setting, for example a password set to a key that
Resend rejects, a wrong host or port, a sender on a domain this
Resend account does not hold, or custom SMTP switched off. It does
not fit a Resend-side problem (domain verified, key "Sortes1" still
exists, account far below any quota). The new "Sortes Production SMTP"
key, created about 2.5 hours after the last good Supabase send, points
to SMTP settings being edited that day. That is an inference, not
verified: the Supabase settings can't be read from here.

## Fix (Supabase dashboard, production project first)

1. **Confirm the cause first (2 minutes).** Supabase Dashboard >
   production project > **Logs > Auth logs**. Filter for `smtp` or
   `mail` around the failed attempts (2026-11-22). The exact SMTP error
   (for example `535 authentication failed`, a dial timeout, or a sender
   rejection) confirms which field is wrong.
2. **Make a fresh Resend key for Supabase** (recommended rather than
   reusing a key the app also uses). Resend > API Keys > Create:
   name `Supabase Auth SMTP (production)`, permission **Sending
   access**, domain `sortes.resonantatlas.com`. Copy it once and do not
   paste it anywhere else.
3. Supabase Dashboard > production project > **Authentication > SMTP
   settings** (Project Settings > Authentication > SMTP Settings in some
   dashboard versions) > **Enable custom SMTP**:
   - Sender email: `noreply@sortes.resonantatlas.com`
   - Sender name: `Sortes`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key from step 2
   - Save.
4. **Authentication > Rate Limits:** check "Rate limit for sending
   emails". Once custom SMTP is on it can be raised above the
   built-in provider's small hourly cap. Keep it modest (for example
   30 to 60 per hour).
5. **Authentication > URL Configuration:** confirm
   `https://sortes.resonantatlas.com/auth/callback` is in the Redirect
   URLs. The app sends `emailRedirectTo = <origin>/auth/callback`.
6. **Test:** on a real browser at https://sortes.resonantatlas.com/account,
   request an email link for a test address you control. Expected: no
   error, and the mail shows as delivered in Resend > Emails within
   seconds. Do this with a new address once (confirmation path) and an
   existing address once (magic-link path).
7. Repeat steps 3 to 5 on the **staging** project (ref `rztk…`) with its
   own key if staging email links are needed. Staging has also been
   silent since 2026-11-10.

## Not verified in this pass

- The official Supabase docs pages (auth-smtp, rate-limits,
  error-codes) could not be fetched from this VM (web access was denied
  in the run). The error codes above come from the installed
  `@supabase/auth-js` package. The dashboard path and the rate-limit
  defaults should be read off the live dashboard while doing the fix.
- The current Supabase SMTP settings and Auth logs (no dashboard
  access from this VM).
- No live email-link test was run. That happens after the fix, on a
  real browser.
