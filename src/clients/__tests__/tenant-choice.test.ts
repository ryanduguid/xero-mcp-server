import { afterEach, describe, expect, test, vi } from "vitest";
import { XeroClient } from "xero-node";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

// Fabricated organisations only.
const DEMO_AU = { tenantId: "11111111-1111-4111-8111-111111111111", tenantName: "Demo AU" };
const DEMO_NZ = { tenantId: "22222222-2222-4222-8222-222222222222", tenantName: "Demo NZ" };

async function loadCustomConnection(
  connections: { tenantId: string; tenantName: string }[],
  chosen?: string,
) {
  vi.stubEnv("XERO_CLIENT_BEARER_TOKEN", "");
  vi.stubEnv("XERO_CLIENT_ID", "synthetic-client");
  vi.stubEnv("XERO_CLIENT_SECRET", "synthetic-secret");
  vi.stubEnv("XERO_SCOPES", "accounting.settings");
  vi.stubEnv("XERO_TENANT_ID", chosen ?? "");
  const axios = (await import("axios")).default;
  vi.mocked(axios.post).mockResolvedValue({
    data: { access_token: "synthetic-token", token_type: "Bearer", expires_in: 1800 },
  });
  vi.mocked(axios.get).mockResolvedValue({ data: connections });
  return (await import("../xero-client.js")).xeroClient;
}

async function loadBearer(
  connections: { tenantId: string; tenantName: string }[],
  chosen?: string,
) {
  vi.stubEnv("XERO_CLIENT_BEARER_TOKEN", "synthetic-bearer");
  vi.stubEnv("XERO_TENANT_ID", chosen ?? "");
  vi.spyOn(XeroClient.prototype, "updateTenants").mockResolvedValue(connections);
  return (await import("../xero-client.js")).xeroClient;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.clearAllMocks();
});

describe.each([
  ["custom connection", loadCustomConnection],
  ["bearer token", loadBearer],
])("organisation choice through a %s", (_, load) => {
  test("refuses when 2 organisations are connected and none is chosen", async () => {
    const client = await load([DEMO_AU, DEMO_NZ]);

    await expect(client.authenticate()).rejects.toThrow(
      /more than one Xero organisation.*XERO_TENANT_ID/s,
    );
    expect(client.tenantId).toBe("");
  });

  test("uses the only connected organisation when none is chosen", async () => {
    const client = await load([DEMO_NZ]);

    await client.authenticate();

    expect(client.tenantId).toBe(DEMO_NZ.tenantId);
  });

  test("uses the chosen organisation, not the first listed", async () => {
    const client = await load([DEMO_AU, DEMO_NZ], DEMO_NZ.tenantId);

    await client.authenticate();

    expect(client.tenantId).toBe(DEMO_NZ.tenantId);
  });

  test("refuses a chosen organisation the connection cannot reach", async () => {
    const client = await load([DEMO_AU], DEMO_NZ.tenantId);

    await expect(client.authenticate()).rejects.toThrow(
      `XERO_TENANT_ID ${DEMO_NZ.tenantId} is not an organisation`,
    );
    expect(client.tenantId).toBe("");
  });
});
