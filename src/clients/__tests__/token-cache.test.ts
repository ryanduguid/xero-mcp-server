import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const TOKEN_LIFETIME_SECONDS = 1800;

function stubCustomConnectionEnv(): void {
  vi.stubEnv("XERO_CLIENT_BEARER_TOKEN", "");
  vi.stubEnv("XERO_CLIENT_ID", "synthetic-client");
  vi.stubEnv("XERO_CLIENT_SECRET", "synthetic-secret");
  vi.stubEnv("XERO_SCOPES", "accounting.settings");
}

async function loadClientWithToken(expiresIn: number | undefined) {
  stubCustomConnectionEnv();
  const axios = (await import("axios")).default;
  vi.mocked(axios.post).mockResolvedValue({
    data: {
      access_token: "synthetic-token",
      token_type: "Bearer",
      ...(expiresIn === undefined ? {} : { expires_in: expiresIn }),
    },
  });
  vi.mocked(axios.get).mockResolvedValue({
    data: [{ tenantId: "synthetic-tenant" }],
  });
  const { xeroClient } = await import("../xero-client.js");
  return { axios, xeroClient };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("custom connection token cache", () => {
  test("reuses a live token instead of re-authenticating", async () => {
    const { axios, xeroClient } = await loadClientWithToken(
      TOKEN_LIFETIME_SECONDS,
    );

    await xeroClient.authenticate();
    await xeroClient.authenticate();

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(1);
    expect(xeroClient.tenantId).toBe("synthetic-tenant");
  });

  test("requests a new token once the cached one expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T00:00:00Z"));
    const { axios, xeroClient } = await loadClientWithToken(
      TOKEN_LIFETIME_SECONDS,
    );

    await xeroClient.authenticate();
    vi.setSystemTime(new Date("2026-09-16T00:30:00Z"));
    await xeroClient.authenticate();

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
  });

  test("refreshes inside the expiry buffer rather than serving a token about to die", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T00:00:00Z"));
    const { axios, xeroClient } = await loadClientWithToken(
      TOKEN_LIFETIME_SECONDS,
    );

    await xeroClient.authenticate();
    // 30 seconds of life left, which is inside the 60 second buffer.
    vi.setSystemTime(new Date("2026-09-16T00:29:30Z"));
    await xeroClient.authenticate();

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
  });

  test("shares one token request between concurrent callers", async () => {
    const { axios, xeroClient } = await loadClientWithToken(
      TOKEN_LIFETIME_SECONDS,
    );

    await Promise.all([
      xeroClient.authenticate(),
      xeroClient.authenticate(),
      xeroClient.authenticate(),
    ]);

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
  });

  test("retries after a failed token request", async () => {
    const { axios, xeroClient } = await loadClientWithToken(
      TOKEN_LIFETIME_SECONDS,
    );
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("network down"));

    await expect(xeroClient.authenticate()).rejects.toThrow();
    await xeroClient.authenticate();

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
  });

  test("does not cache a token with no advertised lifetime", async () => {
    const { axios, xeroClient } = await loadClientWithToken(undefined);

    await xeroClient.authenticate();
    await xeroClient.authenticate();

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
  });
});
