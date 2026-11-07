import { afterEach, describe, expect, test, vi } from "vitest";
import { XeroClient } from "xero-node";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

// Fabricated organisations only.
const DEMO_AU = { tenantId: "aaaaaaaa-1111-4111-8111-111111111111", tenantName: "Demo AU" };
const DEMO_NZ = { tenantId: "bbbbbbbb-2222-4222-8222-222222222222", tenantName: "Demo NZ" };

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

// Refusals list the reachable organisations on stderr, never in the tool
// response, so a practice token's client names do not reach the model.
function silenceServerLog() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
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
    const log = silenceServerLog();
    const client = await load([DEMO_AU, DEMO_NZ]);

    const refusal = await client.authenticate().then(
      () => "",
      (error: Error) => error.message,
    );

    expect(refusal).toMatch(/2 Xero organisations.*XERO_TENANT_ID/s);
    for (const { tenantId, tenantName } of [DEMO_AU, DEMO_NZ]) {
      expect(refusal).not.toContain(tenantId);
      expect(refusal).not.toContain(tenantName);
      expect(log.mock.calls.flat().join(" ")).toContain(`${tenantId} (${tenantName})`);
    }
    expect(client.tenantId).toBe("");
  });

  test("refuses when no organisation is connected", async () => {
    const client = await load([]);

    await expect(client.authenticate()).rejects.toThrow(
      "This connection reaches no Xero organisation.",
    );
    expect(client.tenantId).toBe("");
  });

  test("matches the chosen organisation whatever its letter case", async () => {
    const client = await load([DEMO_AU, DEMO_NZ], DEMO_NZ.tenantId.toUpperCase());

    await client.authenticate();

    expect(client.tenantId).toBe(DEMO_NZ.tenantId);
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
    silenceServerLog();
    const client = await load([DEMO_AU], DEMO_NZ.tenantId);

    const refusal = await client.authenticate().then(
      () => "",
      (error: Error) => error.message,
    );

    expect(refusal).toContain(
      `XERO_TENANT_ID ${DEMO_NZ.tenantId} is not among the 1 Xero organisation`,
    );
    expect(refusal).not.toContain(DEMO_AU.tenantId);
    expect(refusal).not.toContain(DEMO_AU.tenantName);
    expect(client.tenantId).toBe("");
  });
});

test("asks Xero again after a refusal instead of reusing the token", async () => {
  silenceServerLog();
  const client = await loadCustomConnection([DEMO_AU, DEMO_NZ]);
  const axios = (await import("axios")).default;

  await expect(client.authenticate()).rejects.toThrow();
  await expect(client.authenticate()).rejects.toThrow();

  expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);
});
