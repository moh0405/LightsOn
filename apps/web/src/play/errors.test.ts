import { expect, it } from "vitest";
import { CommandError } from "../lib/ws";
import { formError } from "./errors";

it("leaves server rejections to the global toast so they are announced once", () => {
  // The store turns every server error event into the live ErrorToast.
  expect(formError(new CommandError("phase", "Revisions are closed."), "x")).toEqual({ message: "Revisions are closed.", live: false });
});
it("announces client-side failures the toast never sees", () => {
  for (const code of ["disconnected", "timeout", "closed"]) expect(formError(new CommandError(code, "Not connected."), "x").live).toBe(true);
  expect(formError(new Error("Microphone unavailable."), "x")).toEqual({ message: "Microphone unavailable.", live: true });
  expect(formError("boom", "Could not send. Try again.")).toEqual({ message: "Could not send. Try again.", live: true });
});
