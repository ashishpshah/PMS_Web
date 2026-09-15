# Single-Deployable-Unit Architecture

> Context: `CLAUDE.md` says — "The backend is ASP.NET Core 6 Web API; the frontend is a React 19 + Vite SPA. The built SPA (`npm run build`) outputs to `../wwwroot` and is served as static files by the API host on port 5178." This doc explains what that means and how it actually works.

## What this describes

This is a **single-deployable-unit** architecture: two separate codebases (a .NET API and a React SPA) get combined into one running process/one port, rather than being deployed as two separate servers.

## How it actually works, mechanically

### 1. Two separate projects live in this repo
- The backend is the ASP.NET Core 6 Web API project at the repo root (`PMS_Final_Backup.csproj`) — controllers, services, EF Core, SignalR, etc.
- The frontend is a completely independent React 19 + Vite project in `ClientApp/` — its own `package.json`, its own build tooling. During active development you'd normally run this with Vite's own dev server on its own port (3000).

### 2. The build step bridges them
In `ClientApp/vite.config.ts:16`:
```ts
build: {
  outDir: '../wwwroot',
  emptyOutDir: true,
  ...
}
```
Running `npm run build` inside `ClientApp/` compiles the whole React app down to plain static files (`index.html`, hashed JS/CSS bundles, assets) and writes them **up one directory**, into `wwwroot/` at the repo root — `emptyOutDir: true` means it wipes whatever was there first. This is why `wwwroot/` isn't hand-written; it's a build artifact.

### 3. The API host serves those files directly
In `Program.cs:209-210` (and the fallback route further down):
```csharp
app.UseDefaultFiles();
app.UseStaticFiles();
...
app.MapFallbackToFile("index.html");
```
ASP.NET Core's static-file middleware serves anything in `wwwroot/` (by convention — no path configured, it's the default). `MapFallbackToFile("index.html")` is what makes client-side routing work: any request that isn't a matched API route or an existing static file (e.g. browser-refreshing on `/projects/42`) falls back to serving `index.html`, and React Router takes over from there in the browser.

### 4. One port, one process
Since the API and the static SPA are served by the *same* Kestrel host, everything — REST calls to `/api/...`, the SignalR hub at `/hubs/chat`, and the SPA itself — comes from `http://localhost:5178`. There's no separate frontend server in production; `dotnet run` alone is enough once `wwwroot/` has a built SPA in it.

## Why this matters for local development

This is a common trap for anyone new to the repo. Editing files under `ClientApp/src/` and refreshing `localhost:5178` shows *nothing changed*, because that port only ever serves the last `npm run build` output — it never watches `ClientApp/src/`.

That's exactly why active frontend development uses two separate terminals instead:
```bash
# Terminal 1
dotnet run                           # API on :5178

# Terminal 2
cd ClientApp
npm install
npm run dev        # Vite dev on :3000 (proxies /api and /hubs to :5178)
```
Vite's dev server (port 3000) proxies `/api` and `/hubs` requests back to the API on :5178, giving instant hot-reload on frontend changes while still talking to the real backend. `npm run build` → `wwwroot/` is reserved for production, or for locally testing the real combined artifact the way it will actually be deployed.

## Publish & deploy on a live server

### The documented command
`appsettings.json`'s `_note` field (and `CLAUDE.md`'s Publish section) give:
```bash
dotnet publish -c Release --self-contained true -o ./publish && npm run build
```
- `--self-contained true` bundles the .NET 6 runtime into `./publish`, so the target host doesn't need the .NET runtime pre-installed — consistent with the live connection string pointing at a shared Windows-hosting-style SQL Server (`winsome.grabweb.in`).
- ⚠️ **The command order looks backwards.** `PMS_Final_Backup.csproj` has no MSBuild target wiring `npm run build` into the publish pipeline (no `PublishRunWebpack`-style step) — `dotnet publish` just copies whatever is currently sitting in `wwwroot/` at that moment. As written, this runs `dotnet publish` **first** (snapshotting the *old* frontend build into `./publish/wwwroot`) and only *then* rebuilds the frontend into the source tree's `wwwroot/` — which never gets copied anywhere. To actually ship the latest frontend, run it the other way: `npm run build` (refresh `wwwroot/`) **then** `dotnet publish` (so publish picks up the fresh output).

### What happens when the published app starts
- **Migrations run automatically.** `DatabaseInitializer.InitializeAsync()` calls `MigrateAsync()` + seeding on every startup (`Program.cs`), wrapped in try/catch so a cold/unreachable DB logs an error instead of crashing the host. You don't need to manually run `dotnet ef database update` against the live DB — starting the app applies pending migrations itself (though checking `dotnet ef migrations list` before deploying a schema change is still good practice).
- **One process, one port**, exactly as described above — static SPA + API + SignalR hub all served from wherever this process binds.
- **Swagger stays live in production** — `app.UseSwagger()/UseSwaggerUI()` have no environment guard; this is intentional (`F-03`), not a bug.

### Known, documented blockers before a real external launch
`AUDIT_REPORT.md` gives this project a **CONDITIONAL GO for internal/demo deployment**, but explicitly **NO-GO for external production launch** until these are fixed:

| # | Issue | Evidence |
|---|---|---|
| B2 | CORS hardcoded to `localhost:3000`/`localhost:5178` only, not config-driven | `Program.cs`'s `"AllowAll"` policy — the name is misleading, it only allows those two origins |
| B3 | **Username login doesn't exist** — only email or ≥7-digit mobile numbers resolve to a user; a plain username always fails login | `AuthService.cs:37-62` |
| B1 | SMTP (email) password sits in plaintext in `appsettings.json`, not externalized | separate from the *accepted* F-02/F-06 constraints — this one is still open |
| B5 | Refresh token also falls back to `localStorage` (not just the httpOnly cookie) — XSS exposure | `ClientApp/src/lib/api.ts` |

`F-02` (DB creds), `F-03` (Swagger), `F-06` (hardcoded JWT key) are explicitly **accepted, out-of-scope** decisions for this deployment — not things to "fix" as part of a deploy.
