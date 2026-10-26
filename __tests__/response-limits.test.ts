/** @jest-environment node */
import { readBoundedText, ResponseTooLargeError } from "@/lib/response-limits";

it.each([undefined, "1"])("cancels oversized streams with Content-Length %s", async length => {
    const cancel = jest.fn();
    let sent = 0;
    const response = new Response(new ReadableStream({
        pull(controller) { sent++; controller.enqueue(new Uint8Array(8)); }, cancel,
    }), { headers: length ? { "content-length": length } : {} });
    await expect(readBoundedText(response, 10)).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(sent).toBeLessThanOrEqual(3);
});

it("rejects declared oversized bodies without reading them", async () => {
    const cancel = jest.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { "content-length": "100" } });
    await expect(readBoundedText(response, 10)).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(cancel).toHaveBeenCalledTimes(1);
});

it("preserves UTF-8 split across chunks and an exact byte boundary", async () => {
    const text = "café 🚀";
    const bytes = new TextEncoder().encode(text);
    const response = new Response(new ReadableStream({ start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
    } }));
    await expect(readBoundedText(response, bytes.length)).resolves.toBe(text);
});
