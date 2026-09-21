# Git symlink stubs on Windows ship as text files

Class: build/deploy asset integrity. Second occurrence (first: the TypeScript
`custom-elements.d.ts` / `packages/enterprise` links breaking `tsgo`), so this is
now a class doc.

## Symptom

Static UI assets served "fine" (HTTP 200, `Content-Type: image/png`) but were not
images at all. Chrome silently declined PWA install (`docs/features/pwa-install.md`);
earlier the same class surfaced as a typecheck failure, not a runtime one.

## Root cause

Upstream stores shared web assets once and links them into each app:

```
$ git ls-files -s packages/app/public/web-app-manifest-512x512.png
120000 4165998e... packages/app/public/web-app-manifest-512x512.png
```

`mode 120000` is a symlink. This machine checks out with `core.symlinks=false`, so
git writes the *link target string* as the file's content:

```
$ (Get-Item packages/app/public/web-app-manifest-512x512.png).Length
56          # "../../ui/src/assets/favicon/web-app-manifest-512x512.png"
```

Nothing in the build or the server notices: Vite copies the stub, the UI asset
handler maps `.png` → `image/png`, and `curl`/`Invoke-WebRequest` status checks
pass. Only a consumer that decodes the file (a browser, or a byte-level test)
sees the failure.

## Detection

```powershell
git ls-files -s <path>            # 120000 = symlink
[IO.File]::ReadAllBytes($path)[1..3]   # expect "PNG", got "./." / path text
```

Any repo path that is `120000` in git and whose working copy is a few dozen bytes
of text is a stub.

## Fix

For paths this fork actually ships, replace the symlink with a real file and commit
it as a regular file (`git add` records `100644`). Done for the 12 assets under
`packages/app/public/`; the sources stay in `packages/ui/src/assets/`. Trade-off:
merges from upstream can conflict on those paths, which is cheaper than silently
shipping broken assets.

Regression: the `@smoke` check in `packages/app/e2e-site/site.spec.ts` asserts PNG
signature + IHDR dimensions for every manifest icon, and the server test list in
`packages/opencode/test/server/httpapi-ui.test.ts` covers the auth-bypass paths.

## Related

- `docs/features/pwa-install.md`
- `packages/opencode/src/server/shared/public-ui.ts`
