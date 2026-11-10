# kb — the support knowledge base

**kb** = knowledge base. What the support desk knows about how our products break,
written down where the code can keep it honest. One desk handles reports for
`sched-prod` (calendar invites for about 300k people) and the other products.

This component preserves the original KB export and adds a local, one-page SSR
renderer for MEGA S01E03. It includes the signed review page, reproducible analysis,
issue source texts, styled HTML and screenshot.
Repository: [BMachnik/mega-s01e03](https://github.com/BMachnik/mega-s01e03).

## What's here

```text
src/routes/kb/      pages (.svx: Markdown with components)
  triage/          how the desk handles incoming reports
  incidents/       incident pages, including 4471-review/+page.svx
  decisions/       numbered decision records
src/lib/kb/        original components and their logic
src/lib/layouts/   shared page frame
src/lib/data/      ticket-system exports
scripts/           analysis, renderer, evidence and manifest validation
delivery/          analysis, issue drafts, URL manifest and evidence
rendered/          generated HTML and screenshot
tests/             fast checks and separate SSR integration tests
```

## Conventions

- Words in the page, logic in `src/lib` (imported as `#lib/…`). A number that can be computed belongs in a component.
- Every page starts with frontmatter: `title`, `owner`, `status`, `reviewed`. Use `layout: runbook` for the shared frame.
- A decision is never edited after it is accepted. A new record replaces it.
- A page you add is signed: its frontmatter carries your `signature` and it ends with `<RenderStamp {signature} />`, so the desk knows who wrote it.
- Keep the original library, data and existing pages unchanged. The review page is `src/routes/kb/incidents/4471-review/+page.svx`, with owner/signature `BMachnik`.

## Setup and checks

Run these commands from `support-kb/`. The manifest requires Node >=24.19.0;
the implementation was checked with Node 24.19.0 and npm 11.17.0 on Windows.
Dependencies are installed locally and pinned in `package-lock.json`.

```powershell
npm ci --ignore-scripts
npm test
npm run build
npm run test:render
```

The actual installation used `npm ci --ignore-scripts`. The plan lists plain
`npm ci`; enabling dependency lifecycle scripts requires security assessment
before using that command. These commands are not interchangeable installation
evidence. The implementation's 2026-11-10 audit reported two low findings
involving deepmerge and the Svelte Vite plugin, with no fix offered by npm audit.

`npm test` runs the fast Node tests for analysis, desk refs and draft/final URLs.
It needs no browser, network, Vite run or previous build. `npm run test:render`
runs the separate slow suite: real SSR of the original page, completed review
and error/edge fixtures, plus export-byte checks. It creates fresh temporary HTML
and cleans it up; it does not include the fast suite.

## Reproduce the analysis

```powershell
node scripts/analyze.mjs
node scripts/analyze.mjs --write
```

The first command prints JSON; `--write` saves it to `delivery/analysis.json`.
The runner uses the original classifier and local exports: 427 rows become
412 unique reports (15 duplicates), split into parser 379 and hint 33. Five
desk-note reports remain part of the parser group. The output includes source
paths, group IDs, tags and report dates. Drafts are in
`delivery/issues/parser.md` and `delivery/issues/hint.md`; the command does not
rewrite their prose.

## Render and open locally

`npm run build` renders the review page to `rendered/4471-review.html`.
To select another input or output explicitly:

```powershell
node scripts/render.mjs --page src/routes/kb/incidents/4471/+page.svx --out rendered/4471-original.html
```

`--page` selects the `.svx` source; `--out` selects the HTML file. Relative paths
resolve from the component root, even when the command is invoked elsewhere.
The renderer uses Vite/Svelte/mdsvex SSR with the original runbook layout and
injected CSS. It writes a complete UTF-8 HTML document, closes Vite after the
render and exits with an error if rendering fails.

Open `rendered/4471-review.html` directly in a browser, or from PowerShell:

```powershell
Start-Process -FilePath (Resolve-Path './rendered/4471-review.html').Path
```

No hosting or running application server is needed to view this file. This is
a single-page render: the original runbook breadcrumb points to `/kb`, which
does not provide a local KB index when opening the HTML file. Other KB routes
are not generated automatically. Use source files to inspect the other pages.

## Render evidence and browser review

After building the review page, record its provenance:

```powershell
node scripts/write-evidence.mjs
```

This writes `delivery/evidence.json` with the HTML modification time, recording
time and SHA-256 hashes of the page, URL manifest, data, classification/lookup
sources and HTML. Every run resets `browserReview` to `pending`; it does not
capture a screenshot or perform browser checks. Repeat the browser review and
record its result after the last build/evidence run.

Browser review uses the generated HTML in Chromium through `setContent`, because
the browser tool blocks direct file navigation. The screenshot path is
`rendered/4471-review.png`; consult `browserReview` for the recorded review and
screenshot hash. Recorded checks covered desktop light and narrow dark layouts,
200% document zoom, keyboard focus, counts, signature and console errors.
Document zoom was checked, rather than the browser's native zoom control.
Relative source targets were checked on disk; opening those links in the
browser was not tested. The `/kb` breadcrumb remains unavailable in this
standalone view.

## Delivery status

`delivery/issues.json` links the two confirmed issues:

- [Parser: shared month-first date interpretation (#1)](https://github.com/BMachnik/mega-s01e03/issues/1).
- [Hint: booking-v3 date guidance and interpretation disagree (#2)](https://github.com/BMachnik/mega-s01e03/issues/2).

`validateDelivery(manifest, mode)` in `scripts/validate-delivery.mjs` defaults
to `draft`, which permits null URLs. Mode `final` requires both URLs to match
`https://github.com/BMachnik/mega-s01e03/issues/<positive integer>`.
It is an imported validation function, not a CLI; URL validation does not prove
that an issue exists.

Local builds and tests do not publish files. The publication payload is this
component only, excluding dependencies, caches, secrets, workspace history,
sessions and `.flow` records. After any page or issue URL change, rebuild the
HTML, refresh evidence, repeat browser review and replace the screenshot.
Repository and issue links alone do not establish that the files are published
or that the course has accepted the submission.

## Owners

Support desk. Decision records: whoever signed them.

---

Original export: 2026-10-04, from the `support` repo, `apps/kb/` → `src/`.
