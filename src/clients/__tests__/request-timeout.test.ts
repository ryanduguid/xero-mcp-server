import { afterEach, expect, test, vi } from "vitest";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

test("custom connection token and tenant lookups have finite timeouts", async () => {
  vi.stubEnv("XERO_CLIENT_BEARER_TOKEN", "");
  vi.stubEnv("XERO_CLIENT_ID", "synthetic-client");
  vi.stubEnv("XERO_CLIENT_SECRET", "synthetic-secret");
  vi.stubEnv("XERO_SCOPES", "accounting.settings");
  const axios = (await import("axios")).default;
  vi.mocked(axios.post).mockResolvedValue({ data: { access_token: "synthetic-token" } });
  vi.mocked(axios.get).mockResolvedValue({ data: [{ tenantId: "synthetic-tenant" }] });
  const { xeroClient } = await import("../xero-client.js");
  await xeroClient.authenticate();
  expect(vi.mocked(axios.post).mock.calls[0][2]?.timeout).toBe(30_000);
  expect(vi.mocked(axios.get).mock.calls[0][1]?.timeout).toBe(30_000);
});
