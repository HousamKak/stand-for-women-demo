# Stand For Women — redesigned website

A working sales concept using real organization content: a new editorial design, responsive public pages, 26 project stories, 59 partner entries, 32 testimonials, 3 team profiles, 3 downloadable impact reports and a template-driven dashboard.

## Run locally

Requires Node.js 22 or newer. The website has no npm runtime dependencies.

```powershell
cd website
npm run dev
```

Open http://127.0.0.1:5173. Staff demonstration: http://127.0.0.1:5173/admin, then **Explore the dashboard**.

The current delivery is intentionally a sales demo, as requested. The live backend remains deferred until client approval. Use **Reset demo** in the dashboard to restore the starting content between meetings. Dashboard search and visibility filters make larger collections easier to present.

## Publish the sales demo on GitHub Pages

Run from your own PowerShell window, which must have internet access and GitHub CLI authentication:

```powershell
.\Publish-GitHub.ps1
```

The script creates the public `HousamKak/stand-for-women-demo` repository, pushes the website and a rebased `/docs` build, enables Pages on `main /docs`, and waits for the matching build to return HTTP 200. It refuses to overwrite an unrelated repository, does not force-push, and uses a separate `.github-publish` checkout. Tokens remain in GitHub CLI's credential store. The local sales site can continue running during publication.

If GitHub CLI needs authentication, run `gh auth login` first. `-PrepareOnly` creates the Pages-compatible files without accessing GitHub. `-RepositoryName` selects a different new repository; the publisher remembers its target in `.github-publish-state.json` for safe retries. `-NoWait` stops after requesting publication and does not claim the deployment is verified.

The build has been tested under the GitHub project prefix, with all 34 public routes, media, reports and the dashboard. Generated Pages output is `pages-dist/`; a scoped `404.html` preserves client navigation, and `.nojekyll` bypasses Jekyll. Demo pages discourage search indexing. External publication is not yet verified: the connected GitHub app cannot create repositories or configure Pages, and direct terminal connections to GitHub are blocked in the agent environment.

The shipped configuration is a local demonstration. Dashboard changes are saved in browser localStorage, are limited to that browser, and do not affect the existing website. Clear the `sfw-content-v1` localStorage key to restore the original demo content. There is no fake login or pretend server persistence. Without a configured Worker, the contact form opens the visitor's email app rather than claiming to send a message.

## Source and build

- `src/app.js`: public routes, accessible UI controls and content dashboard.
- `src/style.css`: visual system, responsive layouts and reduced-motion support.
- `src/config.js`: public connection settings only.
- `dist/content.json`: structured content from the downloaded website.
- `dist/assets/`: optimized original-site images, locally hosted fonts and PDF reports.
- `dist/asset-provenance.json`: source URL to optimized asset mapping.
- `worker/index.js`: Cloudflare R2 authorization, private previews and public inquiry endpoint.
- `supabase/migrations/001_content_and_rls.sql`: database schema and explicit RLS policies.
- `supabase/tests/rls.sql`: staging database access-control checks, rolled back after execution.
- `tests/browser_qa.py`: desktop/mobile route and dashboard behavior checks.
- `tests/worker.test.mjs`: authorization and input validation checks against mocked upstream services.

```powershell
npm run build
npm run check
node --test tests/worker.test.mjs
```

After changing archived source content, run `python scripts/prepare_website_content.py` from the parent workspace before building. That script requires Pillow and BeautifulSoup and regenerates optimized media and content from the local archive. Browser QA uses Python Playwright and an already-running local server.

## Content and design choices

The design uses cream, plum, coral and lilac, with Inter and Cardo hosted locally. Photography, organization details, partner links, stories and PDFs originate from the public site. Historical Marion Fund statistics retain their August 2022 context. Missing project content and theme-placeholder staff biographies are excluded. Donation actions direct visitors to the team for current arrangements; the demo does not collect payments or reproduce unverified bank details. The visual treatment and edited summaries are proposed creative work for client review.

The current frontend uses native JavaScript modules rather than React. This keeps the sales preview dependency-free and portable; a React requirement would need a deliberate implementation change. The page layouts are predefined. Public copy outside the repeatable collections is currently code-managed; the dashboard manages the five delivered collections.

## Connect a client-owned production backend

No paid subscription, existing hosting configuration, live domain, Supabase project or R2 bucket has been changed.

1. Create the agreed Supabase Pro project. Apply `supabase/migrations/001_content_and_rls.sql`. Invite staff in Supabase Auth, disable public signups, configure trusted auth redirects and insert each approved user's UUID into `public.admins` via the SQL editor. Do not grant client-side access to membership changes.
2. Import approved content into `content_entries`. Each row has `kind`, `title`, `slug`, `status` and the corresponding content object in `data`; assign database UUIDs, not the demo's source identifiers. Use a trusted one-time import, never ship service-role credentials to the browser. Existing public assets may remain bundled; new uploads use R2.
3. Create a **private** R2 bucket matching `wrangler.jsonc`. Keep `r2.dev` and direct public bucket domains disabled. All media is delivered through the Worker so draft visibility can be enforced. Media previews use signed URLs valid for five minutes. Signed URLs are bearer links; do not share private preview links broadly.
4. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and exact `ALLOWED_ORIGINS` in the Worker environment. Add `PREVIEW_SIGNING_SECRET` as a random secret of at least 32 characters. Add `SUPABASE_SERVICE_ROLE_KEY` as a Worker secret only, for validated private inquiry insertion. Configure the rate-limit binding. Use Wrangler >=4.36 for that binding; the CLI is not installed by this prototype.
5. Set `src/config.js` to `mode: 'production'`, the Supabase URL, publishable key and deployed Worker URL. No service-role key or R2 secret belongs in this file. Build and deploy using the client's Cloudflare account. The supplied Wrangler configuration supports static assets and the Worker together. A separate frontend origin is also supported through exact CORS origins.
6. Run the staging RLS checks and live integration checks before launch: public published reads, private drafts, rejected non-admin mutations, staff CRUD, private R2 previews, publication/unpublication, inquiry privacy and trusted origins. Worker tests with mocks do not prove deployed database policies.
7. Agree the canonical domain, preserve/redirect useful old URLs, configure an appropriate publication-aware content-rendering/rebuild strategy for SEO, and verify the production deployment. Route files have unique titles and project descriptions. The demo can be prerendered using `python tests/prerender.py` with the local server running, after building; production rendering must track database publication rather than serving old demo snapshots.

Production integration work still requiring real accounts: live authentication and email recovery delivery, database migration/import and RLS execution, R2 deployment, staff inquiry management/email notifications, provider billing, domain cutover and production SEO rendering. The demo should not be presented as a live secured CMS until these checks pass. The dashboard requests fresh five-minute preview links when loading uploaded drafts. R2 public reads check for an actual published database reference through anonymous RLS, so metadata changes alone cannot expose draft files. Shared files and orphan cleanup need live integration checks.

`node scripts/import-content.mjs` performs a dry run of the 123-record content import. To execute it against an approved target, set `SFW_SUPABASE_URL` and `SFW_SUPABASE_SERVICE_ROLE_KEY` in the process environment and add `--apply`. The import uses deterministic UUIDs and upserts to avoid duplicating records on reruns. It does not create users, charge subscriptions or upload files to R2.

## Verification and publication status

Desktop/mobile browser checks exercise all 34 public routes, project/partner search, report downloads, the gallery and local draft/publish/delete behavior. Worker tests cover denied anonymous and non-admin access, private-object protection, preview signature rejection, CORS and inquiry validation. See `qa/results.json` for the latest run; screenshots are generated locally.

A private Sites preview was registered as `appgprj_6ae0796d05d08191ba3893a4c946d91a`, retained in `.openai/hosting.json`. Uploading its source failed because this execution environment blocks the Git endpoint. It is **not deployed**. Reuse the existing project if publication resumes; do not create a duplicate. The final intended production hosting remains the client's Cloudflare account.

Provider references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [Workers rate limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
