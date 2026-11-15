export interface AudioEntry {
  ms: number; event: string; id?: number; type?: string; text?: string;
  line?: number; duration?: number; value?: string;
}
export function audioMetrics(entries: AudioEntry[]) {
  const messages = entries.filter(e => e.event === 'message' && e.value !== 'preliminary');
  const rows = messages.map(message => {
    const starts = entries.filter(e => e.event === 'start' && e.line === message.id);
    const ends = entries.filter(e => e.event === 'end' && e.line === message.id);
    const first = starts[0];
    const previousEnd = entries.filter(e => e.event === 'end' && e.ms <= (first?.ms ?? message.ms)).at(-1)?.ms ?? message.ms;
    const subtitle = entries.find(e => e.event === 'subtitle' && e.id === message.id);
    return { type: message.type, id: message.id, firstWord: first ? first.ms - message.ms : null,
      readyToStart: first ? first.ms - Math.max(message.ms, previousEnd) : null,
      queueWait: Math.max(0, previousEnd - message.ms), subtitle: subtitle ? subtitle.ms - message.ms : null,
      gaps: starts.slice(1).map((start, i) => start.ms - (ends[i]?.ms ?? start.ms)),
      completed: ends.map(e => e.text).join(' ').replace(/\s+/g, ' ').trim() === message.text };
  });
  const starts = entries.filter(e => e.event === 'start');
  const spans = starts.map(start => ({ start: start.ms, end: entries.find(e => e.event === 'end' && e.id === start.id)?.ms ?? start.ms }));
  const duringSpeech = (entry: AudioEntry) => spans.some(span => entry.ms < span.end && entry.ms + (entry.duration ?? 0) > span.start);
  const longtasks = entries.filter(e => e.event === 'longtask' && duringSpeech(e)).map(e => e.duration ?? 0);
  const frames = entries.filter(e => e.event === 'frame' && spans.some(s => e.ms >= s.start && e.ms <= s.end)).map(e => e.duration ?? 0).sort((a,b) => a-b);
  const boundaryGaps = rows.slice(1).filter((r, i) => r.type === rows[i]?.type).map(r => r.readyToStart ?? Infinity);
  return { rows, maxChunkGap: Math.max(0, ...rows.flatMap(r => r.gaps)), maxLineGap: Math.max(0, ...boundaryGaps),
    maxLongTask: Math.max(0, ...longtasks), longTasksOver100: longtasks.filter(n => n > 100).length,
    frameP95: frames[Math.floor(frames.length * .95)] ?? 0, frameMax: Math.max(0, ...frames),
    voiceDiscoveryMax: Math.max(0, ...entries.filter(e => e.event === 'getVoices').map(e => e.duration ?? 0)),
    nativeErrors: entries.filter(e => e.event === 'error' || e.event === 'cancel').length,
    provisionalSpoken: entries.filter(e => e.event === 'start' && entries.some(m => m.event === 'message' && m.id === e.line && m.value === 'preliminary')).length };
}
