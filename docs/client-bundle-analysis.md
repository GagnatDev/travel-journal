# Client bundle analysis

After a production build, the largest JavaScript files are what the service worker precaches (subject to `maximumFileSizeToCacheInBytes` in `packages/client/vite.config.ts`). Use the analyzer when adding heavy dependencies or changing code-splitting.

## Generate the treemap

From the repo root:

```bash
pnpm --filter @travel-journal/client build:analyze
```

Or from `packages/client`:

```bash
pnpm build:analyze
```

Open `packages/client/dist/stats.html` in a browser (treemap: area ≈ contribution to bundle size). The report is written only when `ANALYZE=1` (the `build:analyze` script sets it); ordinary `pnpm build` does not emit it.

## Reading the chart

- Large rectangles are modules or packages that dominate the bundle; prioritize those when optimizing load or caching.
- Compare gzip/brotli sizes in the report header where available; precache limits apply to uncompressed file sizes on disk.

## Manual chunks

`mapbox-gl` and `date-fns` are split into separate chunks via `build.rollupOptions.output.manualChunks`. If you add more splits, re-run `build:analyze` and confirm each emitted `.js` stays within Workbox precache limits alongside `productionBuild.test.ts`.
