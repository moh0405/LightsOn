/** Speech's citation-removal rule, also applied to generated display copy. */
export function displayDialogue(text: string, propertyId: string | null = null): string {
  let clean = text.replace(/\[?(?:fact[_:-][\w:.-]+|F_\d+_[\w]+(?:[.-][\w]+)*)\]?/gi, " ");
  // Only remove a known property identifier, never arbitrary building quantities.
  if (propertyId && /^\d+$/.test(propertyId)) clean = clean.replace(new RegExp(`\\b${propertyId}\\b`, "g"), " ");
  return clean.replace(/\[\s*\]|\(\s*\)|\{\s*\}|`\s*`/g, " ").replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1").replace(/([.!?])\s*[.,;:]+/g, "$1").replace(/^[ ,;:—-]+|[ ,;:—-]+$/g, "");
}
