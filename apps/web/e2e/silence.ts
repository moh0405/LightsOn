import type { BrowserContext } from "@playwright/test";

/** The OS speech engine plays through the real speakers even in headless Chromium.
 * Volume 0 keeps the start/boundary/end events, so timing stays valid. */
export async function silence<T extends BrowserContext>(context: T): Promise<T> {
  await context.addInitScript(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const speak = synth.speak.bind(synth);
    synth.speak = (utterance: SpeechSynthesisUtterance) => { utterance.volume = 0; speak(utterance); };
  });
  return context;
}
