# Bug 2 E2E re-verification: magic-link redirect to /auth/callback

Date: 2026-11-07. Prerequisite: the dashboard change in
`hidden_files/bug2-redirect-allowlist-spec.md` is applied and saved in
the relevant Supabase project (staging first, production after deploy).
Links sent BEFORE the dashboard change keep their old target, so every
step below must request a FRESH link after the change.

## Staging / Preview (do this first)

1. Deploy (or use) a FRESH direct Preview deployment URL, e.g.
   `https://sortes-muse-<hash>-velus-projects-27f81f38.vercel.app`.
   Note the exact host; the expected landing host below must match it.
2. In the browser, open that deployment host's `/account` page.
3. Enter the test email and request a sign-in link. Wait for the email.
4. Open the email in the browser's Gmail (same browser session).
5. Click the sign-in link in the email.
6. EXPECTED:
   - The browser lands on THAT deployment host's `/auth/callback`
     (same host as step 2, with a `?code=...` parameter), NOT on the
     branch alias and NOT on the site root.
   - It then redirects to `/account?auth=ok` on the SAME host, signed in.
   - The account page shows the signed-in state (credits / sign-out
     visible). No `auth=error` flag.
7. FAILURE SIGNALS (stop and report, do not retry the same link):
   - Lands on the branch-alias root or any site root: the allow list
     still does not cover this host. Re-check the wildcard entry in
     the staging dashboard and that the change was saved.
   - Lands on `/account?auth=error`: the callback ran but the code
     exchange failed. Check the deployment logs for "auth callback
     failed" and whether the Preview env has the staging Supabase vars.
   - "Token has expired or is invalid": the link was prefetched or is
     stale. Request a fresh link and click it once, promptly.

## Production (after deploy, same flow)

1. Open `https://sortes.resonantatlas.com/account` in the browser.
2. Request a fresh sign-in link for the test email.
3. Open the email in the browser's Gmail and click the link.
4. EXPECTED:
   - Lands on `https://sortes.resonantatlas.com/auth/callback?code=...`,
     then `https://sortes.resonantatlas.com/account?auth=ok`, signed in.
   - NOT the Vercel host, NOT the site root.
5. Same failure signals as staging apply; for production, also confirm
   the production project's Redirect URLs list (ref
   `adgputwbdtdmgkiswtnz`) contains `https://sortes.resonantatlas.com/**`.

## Notes

- Do NOT re-click a link from an email sent before the dashboard change;
  it will still go to the old target and prove nothing.
- The OTP code path (8-digit code) is a different flow and does not test
  this fix; this check is specifically the magic-link click-through.
- A signed-in landing on `/account?auth=ok` on the same host that
  requested the link is the pass condition for each environment.
