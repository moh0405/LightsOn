import { CommandError } from "../lib/ws";

/** Codes the socket raises locally; these never reach the store's ErrorToast. */
const LOCAL = new Set(["disconnected", "timeout", "closed"]);

export interface FormError { message: string; live: boolean }

/** A server error event is already announced by the global ErrorToast, so the
 * form keeps it visible but not live: one announcement per failure. */
export function formError(err: unknown, fallback: string): FormError {
  if (err instanceof CommandError) return { message: err.message, live: LOCAL.has(err.code) };
  return { message: err instanceof Error ? err.message : fallback, live: true };
}
