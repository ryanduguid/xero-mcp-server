import { beforeEach, expect, test, vi } from "vitest";

const client = vi.hoisted(() => ({
  tenantId: "test-tenant",
  authenticate: vi.fn(),
  accountingApi: {
    getPrepayments: vi.fn(),
    getOverpayments: vi.fn(),
  },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import { listXeroPrepayments } from "../list-xero-prepayments.handler.js";
import { listXeroOverpayments } from "../list-xero-overpayments.handler.js";
import ListPrepaymentsTool from "../../tools/list/list-prepayments.tool.js";
import ListOverpaymentsTool from "../../tools/list/list-overpayments.tool.js";

type CallableTool = {
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{ isError?: boolean; content: { text?: string }[] }>;
};
const call = (definition: unknown, args: Record<string, unknown> = {}) =>
  (definition as () => CallableTool)().handler(args);

const CONTACT_ID = "4ff1e5cc-9835-40d5-bb18-09fdb118db9c";

beforeEach(() => {
  vi.resetAllMocks();
  client.authenticate.mockResolvedValue(undefined);
  client.accountingApi.getPrepayments.mockResolvedValue({
    body: { prepayments: [] },
  });
  client.accountingApi.getOverpayments.mockResolvedValue({
    body: { overpayments: [] },
  });
});

test("paging and page size sit in their own arguments", async () => {
  await listXeroPrepayments(3);
  await listXeroOverpayments(2);

  const prepaymentArgs = client.accountingApi.getPrepayments.mock.calls[0];
  expect(prepaymentArgs[4]).toBe(3);
  expect(prepaymentArgs[5]).toBeUndefined();
  expect(prepaymentArgs[6]).toBe(10);

  const overpaymentArgs = client.accountingApi.getOverpayments.mock.calls[0];
  expect(overpaymentArgs[4]).toBe(2);
  expect(overpaymentArgs[5]).toBeUndefined();
  expect(overpaymentArgs[6]).toBe(10);
});

test("the first page is requested when the caller does not choose one", async () => {
  await listXeroPrepayments();

  expect(client.accountingApi.getPrepayments.mock.calls[0][4]).toBe(1);
});

test("a contact filter is sent as a guid comparison", async () => {
  await listXeroPrepayments(1, CONTACT_ID);
  await listXeroOverpayments(1, CONTACT_ID);

  const expected = `Contact.ContactID==guid("${CONTACT_ID}")`;
  expect(client.accountingApi.getPrepayments.mock.calls[0][2]).toBe(expected);
  expect(client.accountingApi.getOverpayments.mock.calls[0][2]).toBe(expected);
});

test("no contact filter means no where clause", async () => {
  await listXeroOverpayments();

  expect(client.accountingApi.getOverpayments.mock.calls[0][2]).toBeUndefined();
});

test("a contact ID that is not a UUID never reaches Xero", async () => {
  const injection = `${CONTACT_ID}") OR Total>guid("0`;

  const prepayments = await listXeroPrepayments(1, injection);
  const overpayments = await listXeroOverpayments(1, injection);

  expect(prepayments.isError).toBe(true);
  expect(prepayments.error).toContain("must be a Xero UUID");
  expect(overpayments.isError).toBe(true);
  expect(client.accountingApi.getPrepayments).not.toHaveBeenCalled();
  expect(client.accountingApi.getOverpayments).not.toHaveBeenCalled();
});

test("remaining credit is reported to the caller", async () => {
  client.accountingApi.getPrepayments.mockResolvedValue({
    body: {
      prepayments: [
        {
          prepaymentID: "pp-1",
          type: "RECEIVE-PREPAYMENT",
          contact: { name: "Ridgeway University" },
          date: "2026-08-31",
          status: "AUTHORISED",
          total: 500,
          remainingCredit: 125.5,
        },
      ],
    },
  });

  const result = await call(ListPrepaymentsTool);

  expect(result.content[0].text).toBe("Found 1 prepayments:");
  expect(result.content[1].text).toContain("Remaining Credit: 125.5");
  expect(result.content[1].text).toContain("Contact: Ridgeway University");
});

test("a provider failure reaches the caller with the MCP error flag", async () => {
  client.accountingApi.getPrepayments.mockRejectedValue(
    new Error("Simulated Xero failure"),
  );
  client.accountingApi.getOverpayments.mockRejectedValue(
    new Error("Simulated Xero failure"),
  );

  const prepayments = await call(ListPrepaymentsTool);
  const overpayments = await call(ListOverpaymentsTool);

  expect(prepayments.isError).toBe(true);
  expect(prepayments.content[0].text).toContain("Error listing prepayments");
  expect(overpayments.isError).toBe(true);
  expect(overpayments.content[0].text).toContain("Error listing overpayments");
});
