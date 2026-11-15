# Task: camera framing for every building
You are continuing this worktree (branch camera/framing): keep committed and uncommitted work, review it, finish, commit, push.
Bug: after waking ANY building /screen showed an extreme close-up inside surrounding blocks. Frame each building from its real
height and footprint so the whole tower base-to-roof fits the map viewport with margin at the given viewport and pitch; keep
the open-side bearing and fade occluders; same for the post-revival ease and INTRO handoff; EXPLORE overview fits all buildings.
Playwright for every wakeable building (233953, 233905, 233918, 233928, 233935, 519027) via the real wake path, and Wells
Fargo 233899 by driving the dive function through a test hook, at 1920x1080, 1440x900, 1280x720: top and bottom visible, not
occluded; screenshots in apps/web/e2e/screenshots/camera/. Setup: symlink /Users/momossss/Documents/GitHub/LightsOn/data,
.env and apps/web/public/media; PREP_TRACE_DIR=/Users/momossss/Documents/GitHub/LightsOn/server/cache/prep. Ports
LO_E2E_API_PORT=21201 LO_E2E_WEB_PORT=18274. NO Bedrock calls. Gates: pnpm -r test, full e2e, build, pytest. PR label
agent:codex, footer "🤖 Generated with Codex, coordinated by Claude Code". Run commands in the foreground; end with worker_done.
