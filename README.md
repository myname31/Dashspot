# DASHSPOT

Geometry Dash-inspired guessing game: identify the Extreme Demon level from its song.

## Included
- Pointercrate Top 150 sync via its documented public API
- Five rank tiers: Easy #1–30, Medium #31–60, Hard #61–90, Expert #91–120, Insane #121–150
- Progressive audio hints: 1, 3, 5, 8, 12, 15 seconds
- Manual public audio/image URLs in `data/manifest.json`
- Score, streak, search suggestions, answer popup
- Responsive static site; no framework/build step

## Run locally
Use a local server because the app fetches JSON:
```bash
npx serve .
```
Or use VS Code Live Server.

## Pointercrate sync
`.github/workflows/sync-pointercrate.yml` runs every 6 hours and supports manual runs in GitHub → Actions → Sync Pointercrate Top 150 → Run workflow.

The script calls `https://pointercrate.com/api/v2/demons/listed/` using Pointercrate's documented `limit`/`after` pagination (100 items per page), collects positions 1–150, and writes `data/levels.json`. If the API errors or returns an empty/invalid response, the last successful database is preserved. Scheduled Actions can be delayed by GitHub; this is periodic rather than instant synchronization.

For the workflow to commit changes, enable **Settings → Actions → General → Workflow permissions → Read and write permissions**.

## Add manual media
After the first successful sync, open `data/levels.json` and find the level's Pointercrate `id`. Add an entry using that ID to `data/manifest.json`:
```json
{
  "12345": {
    "audioUrl": "https://media.example.com/audio/example.mp3",
    "imageUrl": "https://media.example.com/images/example.webp"
  }
}
```
Use direct, public URLs that do not expire. Cloudflare R2 with a custom domain is one suitable option. Do not upload large media into this repository. Keep backups: no provider can promise permanent hosting.

The sync script merges manifest media URLs into the refreshed level list. The stable Pointercrate demon ID means a rank change will not move media to a different level.

## GitHub Pages
1. Push the folder contents to a GitHub repository.
2. Settings → Pages → Deploy from a branch.
3. Select `main` and `/ (root)`.
4. Save, then run the sync workflow once from Actions.
5. Wait for the scheduled database sync if you did not run it manually.

## Notes
- The score is local to the current browser session; there is no online leaderboard.
- Audio and image files must be publicly accessible from the browser.
- DASHSPOT is an unofficial fan project, not affiliated with Pointercrate or RobTop Games.
