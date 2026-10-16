# Self-hosted fonts

`src/styles/fonts.css` declares three Latin-subset variable woff2 faces:

| Family | File | Used for |
| --- | --- | --- |
| Geist | `geist-latin-var.woff2` | everything except the items below |
| Geist Mono | `geist-mono-latin-var.woff2` | URLs, domains, ids, points, timestamps |
| Unbounded | `unbounded-latin-var.woff2` | the risk-level word and the hero number only |

## The files are not in this repository yet

They could not be downloaded in the environment where the font layer was
written (no network access, and `npm` was blocked). Because a live `url()` to a
file that is not on disk is a guaranteed 404 on every page load, the three
`sources` are **commented out** in `src/styles/fonts.css`. Each family
therefore resolves through `local()` and then falls through to the next entry
in the stack — `system-ui` / `ui-monospace` — which is why every stack in
`src/styles/tokens.css` ends in a system fallback. No requests are made and
nothing errors; the interface simply renders in the system face.

## Turning them on

Two edits, once the files below are in this directory:

1. Uncomment the `url(...)` line in each of the three `@font-face` blocks in
   `src/styles/fonts.css`.
2. Restore the preload `<link>` in the `<head>` of `index.html` (the commented
   snippet at the top of the file).

Nothing else has to change: the type scale, the `unicode-range` subsets and the
fallback stacks are already in place.

## How to vendor them

Either of these produces the exact filenames above:

```bash
# Option A - from the Fontsource packages (variable, latin subset only)
npm i -D @fontsource-variable/geist @fontsource-variable/geist-mono @fontsource-variable/unbounded
cp node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2 \
   public/fonts/geist-latin-var.woff2
cp node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2 \
   public/fonts/geist-mono-latin-var.woff2
cp node_modules/@fontsource-variable/unbounded/files/unbounded-latin-wght-normal.woff2 \
   public/fonts/unbounded-latin-var.woff2

# Option B - from the upstream releases
#   Geist        https://github.com/vercel/geist-font/releases
#   Unbounded    https://github.com/google/fonts/tree/main/ofl/unbounded
```

Check the total: the budget for the first load is **150 KB gzipped**, so keep
the Latin subset only (`*latin*`, not `*latin-ext*` or `*cyrillic*`). If
Unbounded pushes the total over, drop it — it is used for two words, and
`--font-display` falls back to Geist.

## Why not a CDN

`netlify.toml` sets `style-src 'self'` and `default-src 'self'`. A
`fonts.googleapis.com` stylesheet is refused by the policy, and
`fonts.gstatic.com` font files with it, so the three `<link>` tags this
replaced were costing a blocked request and a preconnect each while never
actually rendering.
