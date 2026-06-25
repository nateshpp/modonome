# Modonome landing page (modonome.com)

The marketing landing page for Modonome. It is a single, dependency-free static page
served by GitHub Pages at https://modonome.com. It lives in this repo on purpose: a PR that
changes a feature can update the page in the same commit, so the page never drifts from the
product.

## Layout

| Path | Purpose |
|------|---------|
| `index.html` | The page. Self-contained: inline CSS, inline SVG logo and favicon, no external scripts or fonts. |
| `content/features.json` | Single source of truth for the feature list. Mirror of the feature copy in the root `README.md`. |
| `CNAME` | Custom-domain marker for GitHub Pages (`modonome.com`). |
| `.nojekyll` | Tells GitHub Pages to serve files as-is, no Jekyll processing. |

## Deploy

Automatic, no human steps after merge. `.github/workflows/pages.yml` deploys to GitHub Pages:

- A pull request that touches `site/**` runs a build check (no deploy).
- A push to `main` that touches `site/**` builds and publishes.

The workflow deploys with the built-in `GITHUB_TOKEN`. There is no long-lived deploy token
to leak or rotate.

## Keeping it in sync with features

The feature copy is duplicated in three places by design, and all three should change
together in one PR:

1. Root `README.md` (the canonical product description).
2. `site/content/features.json` (structured source of truth for the page).
3. `site/index.html` (the rendered copy, currently inlined for zero build cost).

When a future build step is added, `index.html` will be generated from `features.json` so
only steps 1 and 2 are edited by hand.

## House style

The repo's `scripts/check-style.mjs` linter scans `.html` and `.json` here. Avoid em dashes
and the banned phrases (use periods, commas, colons, or parentheses), and never embed AI
authorship signatures. CI fails the PR otherwise.

## Replacing this page with a Claude Design export

This page is a hand-built v1 derived from the product `README.md`. To replace it with the
"Modonome Landing.dc.html" design exported from Claude Design:

1. From Claude Design, use "Send to Claude Code Web" (or download the `.dc.html`).
2. Save its contents as `site/index.html`, keeping the page self-contained (the export
   inlines its own assets, so no extra files are needed).
3. Run the local checks below, in particular the style linter, and replace any em dashes the
   export contains.
4. Open a PR touching `site/**`; the build check runs, and merging to `main` publishes it.

## Run it locally

```bash
npx serve site            # or: python3 -m http.server -d site 8000
node scripts/check-style.mjs site   # the same linter CI runs
```
