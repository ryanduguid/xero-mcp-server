import { beforeEach, expect, test, vi } from "vitest";

const client = vi.hoisted(() => ({
  tenantId: "test-tenant",
  authenticate: vi.fn(),
  accountingApi: { getContact: vi.fn() },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import { getXeroContact } from "../get-xero-contact.handler.js";
import GetContactTool from "../../tools/get/get-contact.tool.js";

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
});

test("the contact ID is sent as the path parameter", async () => {
  client.accountingApi.getContact.mockResolvedValue({
    body: { contacts: [{ contactID: CONTACT_ID, name: "Ridgeway University" }] },
  });

  await getXeroContact(CONTACT_ID);

  const args = client.accountingApi.getContact.mock.calls[0];
  expect(args[0]).toBe("test-tenant");
  expect(args[1]).toBe(CONTACT_ID);
});

test("an empty response is an error rather than an empty contact", async () => {
  client.accountingApi.getContact.mockResolvedValue({ body: { contacts: [] } });

  const response = await getXeroContact(CONTACT_ID);

  expect(response.isError).toBe(true);
  expect(response.error).toContain("No contact found");
});

test("balances, terms and addresses reach the caller", async () => {
  client.accountingApi.getContact.mockResolvedValue({
    body: {
      contacts: [
        {
          contactID: CONTACT_ID,
          name: "Ridgeway University",
          contactStatus: "ACTIVE",
          isCustomer: true,
          emailAddress: "accounts@example.com",
          taxNumber: "12 345 678 901",
          taxNumberType: "ABN",
          accountsReceivableTaxType: "OUTPUT",
          paymentTerms: { sales: { day: 20, type: "OFFOLLOWINGMONTH" } },
          balances: {
            accountsReceivable: { outstanding: 1200.5, overdue: 300 },
          },
          addresses: [
            {
              addressType: "STREET",
              addressLine1: "12 Example St",
              city: "Newcastle",
              region: "NSW",
              postalCode: "2300",
              country: "Australia",
            },
          ],
          phones: [
            {
              phoneType: "DEFAULT",
              phoneCountryCode: "61",
              phoneAreaCode: "02",
              phoneNumber: "4000 0000",
            },
          ],
        },
      ],
    },
  });

  const result = await call(GetContactTool, { contactId: CONTACT_ID });
  const text = result.content[0].text ?? "";

  expect(text).toContain("Contact: Ridgeway University");
  expect(text).toContain("Tax Number: 12 345 678 901 (ABN)");
  expect(text).toContain("Sales Terms: 20 OFFOLLOWINGMONTH");
  expect(text).toContain("Receivable: 1200.5 outstanding, 300 overdue");
  expect(text).toContain("12 Example St, Newcastle, NSW, 2300, Australia");
  expect(text).toContain("61 02 4000 0000");
});

test("bank account details are never reported", async () => {
  client.accountingApi.getContact.mockResolvedValue({
    body: {
      contacts: [
        {
          contactID: CONTACT_ID,
          name: "Ridgeway University",
          bankAccountDetails: "123-456 78901234",
        },
      ],
    },
  });

  const result = await call(GetContactTool, { contactId: CONTACT_ID });

  expect(result.content[0].text).not.toContain("123-456");
  expect(result.content[0].text).not.toContain("78901234");
});

test("a provider failure reaches the caller with the MCP error flag", async () => {
  client.accountingApi.getContact.mockRejectedValue(
    new Error("Simulated Xero failure"),
  );

  const result = await call(GetContactTool, { contactId: CONTACT_ID });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Error getting contact");
});
