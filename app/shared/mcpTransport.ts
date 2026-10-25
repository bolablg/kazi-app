/** Split header fields without treating quoted parameter text as a separator. */
function fields(value: string, separator: string) {
  const result: string[] = [];
  let quoted = false,
    escaped = false,
    start = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (escaped) escaped = false;
    else if (quoted && character === "\\") escaped = true;
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === separator) {
      result.push(value.slice(start, index));
      start = index + 1;
    }
  }
  if (quoted || escaped) return [];
  result.push(value.slice(start));
  return result;
}

/** Select a response format; the SDK still validates the original Accept header. */
export function prefersMcpEventStream(accept: string | null) {
  const preferences = new Map<string, { quality: number; order: number }>();
  for (const [order, range] of fields(accept ?? "", ",").entries()) {
    const [type, ...parameters] = fields(range, ";");
    const mediaType = type.trim().toLowerCase();
    if (!["application/json", "text/event-stream"].includes(mediaType))
      continue;
    let quality = 1,
      weighted = false;
    for (const parameter of parameters) {
      const [name, ...parts] = parameter.split("=");
      if (name.trim().toLowerCase() !== "q") continue;
      const value = parts.join("=").trim();
      // RFC 9110 qvalues are 0..1 with at most three fractional digits.
      if (weighted || !/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value)) {
        quality = 0;
        break;
      }
      weighted = true;
      quality = Number(value);
    }
    const previous = preferences.get(mediaType);
    if (!previous || quality > previous.quality)
      preferences.set(mediaType, { quality, order });
  }
  const stream = preferences.get("text/event-stream");
  const json = preferences.get("application/json");
  return (
    !!stream &&
    stream.quality > 0 &&
    (!json ||
      stream.quality > json.quality ||
      (stream.quality === json.quality && stream.order < json.order))
  );
}
