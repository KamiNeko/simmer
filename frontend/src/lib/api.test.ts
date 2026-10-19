import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "./api";

const respond = (body: string, init: ResponseInit) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body, init)));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("reports an HTML page with a success status as an unexpected response", async () => {
    respond("<!doctype html><title>Log in</title>", { status: 200, headers: { "Content-Type": "text/html" } });
    const error = await api.users().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, message: "The server sent an unexpected response (status 200)" });
  });

  it("falls back to a readable message for an error without JSON or status text", async () => {
    respond("<html>Bad gateway</html>", { status: 502, statusText: "" });
    await expect(api.users()).rejects.toMatchObject({ status: 502, message: "The server sent an unexpected response (status 502)" });
  });

  it("keeps the status text or the server's detail when there is one", async () => {
    respond("oops", { status: 503, statusText: "Service Unavailable" });
    await expect(api.users()).rejects.toMatchObject({ message: "Service Unavailable" });
    respond(JSON.stringify({ detail: "Not allowed" }), { status: 403 });
    await expect(api.users()).rejects.toMatchObject({ status: 403, message: "Not allowed" });
  });
});
