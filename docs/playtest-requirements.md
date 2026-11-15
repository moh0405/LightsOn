# Playtest requirements (user, Nov 14 late night): the bar for "done"

Everything is verified with Playwright / headless browser, end to end, every building, every small thing.

1. **Audio lag**: the building's voice lags badly on all buildings. Owner: `audio-lag` (docs/agents/audio-lag-spec.md).
2. **Start-screen 3D looks bad**: make the skyline cinematic. Owner: visual polish (docs/agents/visual-polish-spec.md), after camera framing.
3. **Selecting a building / floor and the dive animation** are not as intended: fix once the workflow works. Owner: camera-framing, then visual polish.
4. **The AI voice lacks knowledge**: power replies with LangChain so the building knows its facts. Owner: `live-knowledge` (LangChain on Bedrock; no Gemini key).
5. **Check Matterport, CoStar and Vexcel APIs** for real. Owner: `workflow-audit`.
6. **Matterport 3D space appears ~1 s then disappears**: must stay and be walkable. Owner: `matterport-walkin`.
7. **Check every small thing headless**: Owner: `workflow-audit`, then fix workers per area, then a final QA sweep.

Done means: a final headless sweep passes for all 7 buildings at 3 viewports with these seven items verified, and
docs/morning-summary.md says what to test.
