export interface SseEvent {
  event: string;
  data: unknown;
}

/** Parse a fetch Response body as a stream of Server-Sent Events. */
export async function* readSse(res: Response): AsyncGenerator<SseEvent> {
  if (!res.body) throw new Error("response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        let eventName = "message";
        let dataStr = "";
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event: ")) eventName = line.slice(7);
          else if (line.startsWith("data: ")) {
            dataStr += (dataStr ? "\n" : "") + line.slice(6);
          }
        }
        if (!dataStr) continue;

        try {
          yield { event: eventName, data: JSON.parse(dataStr) };
        } catch {
          // skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
