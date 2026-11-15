# Task: Matterport walk-in
You are continuing this worktree (branch matterport/walk-in): keep committed and uncommitted work, review it, finish, commit, push.
Players must be able to actually walk the real Matterport interiors. Use the public showcase embed my.matterport.com/show/?m=<id>
(no SDK through the tunnel). M key + 'Walk inside' button on /screen and an /admin button (approved contract additions:
host_action 'walk_inside' {building_id?, model_id?, open} with HOST_PIN, screen-only event 'tour_requested' {building_id,
model_id, open}; presentation only; document in the PR and docs/PRD.md Contracts) open a full-viewport tour with tabs per model
named via a cached GET /api/buildings/{id}/tours (public player API, timeout/fallback, no keys); Esc/M closes; never blocks the
round. INTRO shows the Lobby tour ~6 s. Fill model ids for every building from the kit (deterministic dossier regen, CoStar
facts unchanged). 8 s load fallback to the cover image with 'tour unavailable', no toast. Tests: endpoint (mock HTTP),
Playwright with a stubbed iframe, one real screenshot of the Esperson lobby tour in apps/web/e2e/screenshots/matterport/.
Setup symlinks for data, .env, apps/web/public/media. Ports LO_E2E_API_PORT=21401 LO_E2E_WEB_PORT=18474. NO Bedrock calls.
Gates: pytest, pnpm -r test, full e2e, build. PR label agent:codex, footer "🤖 Generated with Codex, coordinated by Claude
Code". Run commands in the foreground; end with worker_done.
