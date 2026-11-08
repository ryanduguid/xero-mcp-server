import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { AxiosError, AxiosHeaders } from "axios";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { XeroClient } from "xero-node";
import { z } from "zod";

// The real client module runs; only its HTTP layer is replaced. The token
// request and the connections lookup go through axios, and every Xero API
// method is spied on below, so nothing leaves the process.
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("axios", async (importOriginal) => ({
  ...(await importOriginal<typeof import("axios")>()),
  default: { post: vi.fn(), get: vi.fn() },
}));

// Fabricated organisations and token only.
const TOKEN = "synthetic-token-0c9e";
const ORGANISATIONS = [
  { tenantId: "aaaaaaaa-1111-4111-8111-111111111111", tenantName: "Fixture Client One" },
  { tenantId: "bbbbbbbb-2222-4222-8222-222222222222", tenantName: "Fixture Client Two" },
];
type Connection = (typeof ORGANISATIONS)[number];

type ApiSpy = ReturnType<typeof vi.fn>;

// Replace every method on every xero-node API object the client holds
// (accountingApi, payrollAUApi, payrollNZApi and the rest) with a spy that
// records the call and fails. Any Xero API read or write shows up here.
function spyOnEveryXeroApiMethod(client: object) {
  const calls: string[] = [];
  const spies = new Map<string, ApiSpy>();
  for (const [apiName, api] of Object.entries(client)) {
    if (!apiName.endsWith("Api") || typeof api !== "object" || api === null) continue;
    for (
      let proto = Object.getPrototypeOf(api);
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)
    ) {
      for (const method of Object.getOwnPropertyNames(proto)) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, method);
        if (method === "constructor" || typeof descriptor?.value !== "function") continue;
        const spy = vi.spyOn(api, method).mockImplementation(async () => {
          calls.push(`${apiName}.${method}`);
          throw new Error("Xero API called");
        });
        spies.set(`${apiName}.${method}`, spy as unknown as ApiSpy);
      }
    }
  }
  return { calls, spies };
}

async function loadServer(kind: string, connections: Connection[]) {
  vi.stubEnv("XERO_TENANT_ID", "");
  vi.stubEnv("XERO_SCOPES", "accounting.settings");
  if (kind === "custom connection") {
    vi.stubEnv("XERO_CLIENT_BEARER_TOKEN", "");
    vi.stubEnv("XERO_CLIENT_ID", "synthetic-client");
    vi.stubEnv("XERO_CLIENT_SECRET", "synthetic-secret");
  } else {
    vi.stubEnv("XERO_CLIENT_BEARER_TOKEN", TOKEN);
    vi.spyOn(XeroClient.prototype, "updateTenants").mockImplementation(
      async () => connections,
    );
  }
  const axios = (await import("axios")).default;
  vi.mocked(axios.post).mockResolvedValue({
    data: { access_token: TOKEN, token_type: "Bearer", expires_in: 1800 },
  });
  vi.mocked(axios.get).mockResolvedValue({ data: connections });
  const { xeroClient } = await import("../../clients/xero-client.js");
  const { ToolFactory } = await import("../tool-factory.js");
  return { axios, ToolFactory, ...spyOnEveryXeroApiMethod(xeroClient) };
}

// Schema-valid arguments for any registered tool: optional and defaulted
// fields are left out, IDs are UUIDs and date fields are calendar dates, so
// the call reaches the handler's own path rather than input validation.
function sample(schema: z.ZodTypeAny, field = ""): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) return undefined;
  if (schema instanceof z.ZodString) {
    if (schema.format === "email") return "fixture@example.com";
    if (schema.format === "date" || /date/i.test(field)) return "2026-07-01";
    return randomUUID();
  }
  if (schema instanceof z.ZodNumber) return 1;
  if (schema instanceof z.ZodBoolean) return false;
  if (schema instanceof z.ZodEnum) return schema.options[0];
  // 2 items: a manual journal needs at least 2 lines.
  if (schema instanceof z.ZodArray) {
    return [1, 2].map(() => sample(schema.element as z.ZodTypeAny, field));
  }
  if (schema instanceof z.ZodObject) {
    return Object.fromEntries(
      Object.entries(schema.shape).map(([name, value]) => [
        name,
        sample(value as z.ZodTypeAny, name),
      ]),
    );
  }
  throw new Error(`No sample for the schema of ${field}`);
}

const text = (result: { content?: { text?: string }[] }) =>
  (result.content ?? []).map((block) => block.text ?? "").join("\n");

function expectNoOrganisationOrToken(output: string, context: string) {
  for (const { tenantId, tenantName } of ORGANISATIONS) {
    expect(output, context).not.toContain(tenantId);
    expect(output, context).not.toContain(tenantName);
  }
  expect(output, context).not.toContain(TOKEN);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.clearAllMocks();
});

describe.each(["custom connection", "bearer token"])(
  "every registered tool through a %s reaching 2 organisations",
  (kind) => {
    it("is refused before any Xero API call, naming no organisation", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { ToolFactory, calls, spies } = await loadServer(kind, ORGANISATIONS);
      expect([...spies.keys()]).toEqual(
        expect.arrayContaining([
          "accountingApi.getAccounts",
          "payrollAUApi.getPayRuns",
          "payrollNZApi.getEmployees",
        ]),
      );

      const register = vi.fn();
      ToolFactory({ tool: register } as unknown as McpServer, {});
      expect(register.mock.calls.length).toBeGreaterThan(0);

      for (const [name, , shape, , handler] of register.mock.calls) {
        const schema = z.object(shape);
        const result = await handler(schema.parse(sample(schema)), {} as never);
        const body = text(result);

        expectNoOrganisationOrToken(body, name);
        expect(result.isError, name).toBe(true);
        expect(body, name).toContain("This connection reaches 2 Xero organisations.");
      }
      expect(calls).toEqual([]);
    });
  },
);

describe("stdio output on refusal and failure paths", () => {
  it("is only JSON-RPC, with no token or organisation name", async () => {
    const serverLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const strayStdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const { axios, ToolFactory, spies } = await loadServer(
      "custom connection",
      ORGANISATIONS,
    );
    const server = new McpServer({ name: "fixture-server", version: "1.0.0" });
    ToolFactory(server, {});

    const input = new PassThrough();
    const output = new PassThrough();
    let stdout = "";
    output.on("data", (chunk) => (stdout += chunk));
    const replies = createInterface({ input: output })[Symbol.asyncIterator]();
    const exchange = async (message: object) => {
      input.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
      const reply = await replies.next();
      return JSON.parse(reply.value!);
    };
    const callTool = (id: number, name: string) =>
      exchange({ id, method: "tools/call", params: { name, arguments: {} } });

    try {
      await server.connect(new StdioServerTransport(input, output));
      await exchange({
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "fixture-client", version: "1.0.0" },
        },
      });
      input.write(
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
      );

      // Refusal: 2 organisations and none chosen.
      for (const [id, name] of [
        [2, "list-accounts"],
        [3, "list-payroll-pay-runs"],
      ] as const) {
        const reply = await callTool(id, name);
        expectNoOrganisationOrToken(text(reply.result), name);
        expect(reply.result.isError, name).toBe(true);
        expect(text(reply.result)).toContain("reaches 2 Xero organisations");
      }

      // Failure: the connections lookup rejects with the token in its request.
      vi.mocked(axios.get).mockRejectedValueOnce(
        new AxiosError(
          "Request failed with status code 500",
          "ERR_BAD_RESPONSE",
          { headers: new AxiosHeaders({ Authorization: `Bearer ${TOKEN}` }) },
          null,
          {
            status: 500,
            statusText: "Internal Server Error",
            headers: {},
            config: { headers: new AxiosHeaders({ Authorization: `Bearer ${TOKEN}` }) },
            data: { Detail: "fixture connections failure" },
          },
        ),
      );
      expect((await callTool(4, "list-accounts")).result.isError).toBe(true);

      // Failure: one organisation, and the Xero API rejects the way xero-node
      // does, with the request and its bearer token serialised into a string.
      vi.mocked(axios.get).mockResolvedValue({ data: [ORGANISATIONS[0]] });
      spies.get("accountingApi.getAccounts")!.mockRejectedValue(
        JSON.stringify({
          response: { statusCode: 500, body: { Detail: "fixture API failure" } },
          request: { headers: { authorization: `Bearer ${TOKEN}` } },
        }),
      );
      const failed = await callTool(5, "list-accounts");
      expect(failed.result.isError).toBe(true);
      expect(text(failed.result)).toContain("fixture API failure");
    } finally {
      await server.close();
    }

    const lines = stdout.split("\n").filter((line) => line !== "");
    expect(lines.map((line) => JSON.parse(line).id)).toEqual([1, 2, 3, 4, 5]);
    for (const line of lines) expect(JSON.parse(line).jsonrpc).toBe("2.0");
    expectNoOrganisationOrToken(stdout, "stdout");
    expect(strayStdout).not.toHaveBeenCalled();

    // The names reached the server log on stderr instead.
    const logged = serverLog.mock.calls.flat().join(" ");
    for (const { tenantName } of ORGANISATIONS) expect(logged).toContain(tenantName);
  });
});
