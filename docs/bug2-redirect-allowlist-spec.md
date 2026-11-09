# Bug 2 dashboard spec: Supabase Redirect URLs allow list (magic link)

Date: 2026-11-07. Investigator: Bug 2 (Sortes fix round). Code side already
correct, see below. This file is the exact dashboard change for the parent
to apply. No code change fixes this bug; the allow list is the fix.

## Root cause (verified in code)

- `src/app/account/AccountClient.tsx:160` passes
  `options: { emailRedirectTo: `${window.location.origin}/auth/callback` }`
  in the `signInWithOtp` call (landed in commit `3140b9a`, "Use visitor
  origin for Supabase sign-in redirect and callback", 2026-11-02; reflowed
  by `2563b69` on 2026-11-06, content unchanged).
- Repo-wide grep of `src/` for `signInWithOtp`, `resetPasswordForEmail`,
  `signUp`, `signInWithOAuth`, `inviteUserByEmail`, `emailRedirectTo`,
  `redirectTo`: `signInWithOtp` in `AccountClient.tsx` is the ONLY Supabase
  email-link entry point. The signup/login API routes
  (`src/app/api/auth/signup/route.ts`, `src/app/api/auth/login/route.ts`)
  are local password routes and send no email links. No code gap found.
- `src/app/auth/callback/route.ts` exists and exchanges the code via
  `exchangeCodeForSession`, then redirects to `/account?auth=ok` on the
  request origin. The root route does no code exchange, which is why a
  fallback to the Site URL lands the user signed out.
- When the `redirectTo` passed to Supabase is NOT on the project's
  Redirect URLs allow list, Supabase silently ignores it and falls back
  to the Site URL. The match is against the full URL including path.
  The E2E link was requested from a direct deployment host
  (`sortes-muse-eyh9suhmh-...`), whose `/auth/callback` URL is not in
  the staging allow list (only the branch alias + 4 URLs were added on
  2026-11-06), so Supabase fell back to the Site URL, the branch-alias
  root, and the root does not exchange the code.

## Change to apply (dashboard only, both projects)

Path in each project dashboard: Authentication -> URL Configuration ->
Redirect URLs.

### Staging project

- Project: "Sortes Staging", ref `rztkdkespxliddkdafok`
- Dashboard URL: https://supabase.com/dashboard/project/rztkdkespxliddkdafok/auth/url-configuration

Add this entry (keep the existing branch-alias + 4 URLs; do not remove them):

```
https://*-velus-projects-27f81f38.vercel.app/**
```

This wildcard covers every Vercel Preview deployment, including the
branch alias and every direct deployment URL (e.g.
`sortes-muse-eyh9suhmh-velus-projects-27f81f38.vercel.app`), so any
future preview host's `/auth/callback` is allow-listed without a new
dashboard edit per deployment.

### Production project

- Project ref `adgputwbdtdmgkiswtnz`
- Dashboard URL: https://supabase.com/dashboard/project/adgputwbdtdmgkiswtnz/auth/url-configuration

Add these entries:

```
https://*-velus-projects-27f81f38.vercel.app/**
https://sortes.resonantatlas.com/**
```

The wildcard covers Preview deployments pointed at the production
project (if any); the production entry covers the live host. Keep any
existing entries.

### Local dev (both projects, to verify)

```
http://localhost:3000/**
```

Add only if not already present. Mark as to-verify: check the current
list in the dashboard before adding; do not duplicate an existing entry.

## Site URL: DO NOT CHANGE

The Site URL in each project must stay as it is. The Site URL is only
the fallback; the fix is the allow list, not a new Site URL. Changing
the Site URL would move the fallback, not fix the allow-list miss.

## Verification of the dashboard save

- After saving, confirm the dashboard accepts the wildcard entry (no
  validation error on `*` in the subdomain position).
- Links already sent keep their old target: request a FRESH magic link
  after the change; do not re-click an old email link.
- Re-verification steps: see `hidden_files/bug2-e2e-reverify.md`.

## Email-template question: ANSWERED (verified, not open)

Question: does the staging project's default magic-link template use
the redirect passed by the code?

Answer: YES. Source: official Supabase docs, "Email Templates"
(https://supabase.com/docs/guides/auth/auth-email-templates, updated
2026-10-29, read 2026-11-07):

- `{{ .ConfirmationURL }}` is "the confirmation URL", e.g.
  `https://project-ref.supabase.co/auth/v1/verify?token=...&type=email&redirect_to=https://example.com/path`.
  The default template links `{{ .ConfirmationURL }}`, so the passed
  redirect travels inside it as the `redirect_to` query parameter.
- `{{ .RedirectTo }}` is "the redirect URL passed when `signUp`,
  `signInWithOtp`, `signInWithOAuth`, `resetPasswordForEmail` or
  `inviteUserByEmail` is called. The redirect URL allow list can be
  configured in your project's authentication settings."
- The same page states: "the default email link will redirect the user
  after verification to the redirect URL" (server-side endpoint section).

So with the default template, no template edit is needed. The only
remaining template risk would be a CUSTOM template using
`{{ .SiteURL }}` instead of `{{ .ConfirmationURL }}` / `{{ .RedirectTo }}`;
the staging project uses the default template, so this does not apply.
If a template is ever customized, it must keep `{{ .ConfirmationURL }}`
(or build its link from `{{ .RedirectTo }}`) or the passed redirect will
be ignored regardless of the allow list.

## Test coverage added (code side, this round)

- New test `src/app/account/AccountClient.test.ts` (3 tests, all passing):
  asserts `emailRedirectTo: `${window.location.origin}/auth/callback`` is
  passed, exactly one `signInWithOtp` call exists, and no other Supabase
  email-link flow is sent from the component. Mutation-checked: changing
  the path to `/wrong` fails 1 test, then reverted.
- No production code was changed: none was needed.
