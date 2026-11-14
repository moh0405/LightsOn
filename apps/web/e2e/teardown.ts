import { rmSync } from "node:fs";

export default function teardown() {
  if (process.env.LO_E2E_STATE_DIR) rmSync(process.env.LO_E2E_STATE_DIR, { recursive: true, force: true });
}
