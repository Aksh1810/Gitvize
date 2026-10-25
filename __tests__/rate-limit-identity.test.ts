/** @jest-environment node */
jest.useFakeTimers();
const { getClientIp } = jest.requireActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");

const vercel = process.env.VERCEL;
afterAll(() => jest.useRealTimers());
afterEach(() => {
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
});

it("ignores all caller forwarding headers on direct hosting", () => {
    delete process.env.VERCEL;
    for (const ip of ["198.51.100.1", "198.51.100.2"]) {
        expect(getClientIp(new Request("http://localhost", { headers: {
            "x-forwarded-for": ip, "x-real-ip": ip, "x-vercel-forwarded-for": ip,
        } }))).toBe("unknown");
    }
});

it("uses Vercel's protected address rather than caller XFF/X-Real-IP", () => {
    process.env.VERCEL = "1";
    expect(getClientIp(new Request("http://localhost", { headers: {
        "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2", "x-vercel-forwarded-for": "2001:db8::1",
    } }))).toBe("2001:db8::1");
    expect(getClientIp(new Request("http://localhost", { headers: { "x-vercel-forwarded-for": "forged" } }))).toBe("unknown");
});
