export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_BATCH_BYTES = 2 * 1024 * 1024;
export const FILE_BATCH_CONCURRENCY = 4;

export class ResponseTooLargeError extends Error {
    constructor() { super("Content exceeds maximum allowed size"); }
}

/** Count actual bytes: Content-Length can be missing or dishonest. */
export async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
    if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel();
        throw new ResponseTooLargeError();
    }
    if (!response.body) return "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parts: string[] = [];
    let bytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > maxBytes) {
                await reader.cancel();
                throw new ResponseTooLargeError();
            }
            parts.push(decoder.decode(value, { stream: true }));
        }
        parts.push(decoder.decode());
        const text = parts.join("");
        if (Buffer.byteLength(text, "utf8") > maxBytes) throw new ResponseTooLargeError();
        return text;
    } finally {
        reader.releaseLock();
    }
}
