export async function* parseServerSentEvents(body) {
  if (!body) {
    throw new Error("响应没有可读取的流");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseEventBlock(block);
        if (event) {
          yield event;
        }
        boundary = buffer.indexOf("\n\n");
      }

      if (done) {
        break;
      }
    }

    const finalEvent = parseEventBlock(buffer);
    if (finalEvent) {
      yield finalEvent;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEventBlock(block) {
  if (!block.trim()) {
    return null;
  }

  const event = { event: "message", data: "" };
  const dataLines = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    const separator = line.indexOf(":");
    const field = separator >= 0 ? line.slice(0, separator) : line;
    let value = separator >= 0 ? line.slice(separator + 1) : "";
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    if (field === "data") {
      dataLines.push(value);
    } else if (field === "event") {
      event.event = value;
    } else if (field === "id") {
      event.id = value;
    } else if (field === "retry") {
      event.retry = Number.parseInt(value, 10);
    }
  }

  if (dataLines.length === 0) {
    return null;
  }
  event.data = dataLines.join("\n");
  return event;
}
