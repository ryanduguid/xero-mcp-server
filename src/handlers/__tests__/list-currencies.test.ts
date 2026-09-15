import { beforeEach, expect, test, vi } from "vitest";

const client = vi.hoisted(() => ({
  tenantId: "test-tenant",
  authenticate: vi.fn(),
  accountingApi: { getCurrencies: vi.fn() },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import { listXeroCurrencies } from "../list-xero-currencies.handler.js";
import ListCurrenciesTool from "../../tools/list/list-currencies.tool.js";

type CallableTool = {
  schema: Record<string, unknown>;
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{ isError?: boolean; content: { text?: string }[] }>;
};
const tool = (definition: unknown) => (definition as () => CallableTool)();

beforeEach(() => {
  vi.resetAllMocks();
  client.authenticate.mockResolvedValue(undefined);
});

test("listing currencies takes no arguments and sends none", async () => {
  client.accountingApi.getCurrencies.mockResolvedValue({
    body: { currencies: [] },
  });

  await listXeroCurrencies();

  const args = client.accountingApi.getCurrencies.mock.calls[0];
  expect(args[0]).toBe("test-tenant");
  expect(args[1]).toBeUndefined();
  expect(args[2]).toBeUndefined();
  expect(tool(ListCurrenciesTool).schema).toEqual({});
});

test("each currency is reported with its code and description", async () => {
  client.accountingApi.getCurrencies.mockResolvedValue({
    body: {
      currencies: [
        { code: "AUD", description: "Australian Dollar" },
        { code: "NZD", description: "New Zealand Dollar" },
      ],
    },
  });

  const result = await tool(ListCurrenciesTool).handler({});

  expect(result.content[0].text).toBe("Found 2 currencies:");
  expect(result.content[1].text).toBe("AUD: Australian Dollar");
  expect(result.content[2].text).toBe("NZD: New Zealand Dollar");
});

test("a provider failure reaches the caller with the MCP error flag", async () => {
  client.accountingApi.getCurrencies.mockRejectedValue(
    new Error("Simulated Xero failure"),
  );

  const result = await tool(ListCurrenciesTool).handler({});

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Error listing currencies");
});
