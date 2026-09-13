// Regression cover for the fact-check findings fixed in this repository:
// F109, F111, F117, F120, F129, F130, F133, F134 and F137.
import { beforeEach, expect, test, vi } from "vitest";
import { readFileSync } from "fs";
import { LineAmountTypes } from "xero-node";

const client = vi.hoisted(() => ({
  tenantId: "test-tenant",
  authenticate: vi.fn(),
  getShortCode: vi.fn(),
  payrollNZApi: { getEmployees: vi.fn() },
  accountingApi: Object.fromEntries(
    [
      "getItems",
      "createItems",
      "updateItem",
      "createManualJournals",
      "getOrganisations",
      "createPayment",
      "getAccounts",
    ].map((name) => [name, vi.fn()]),
  ),
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import { listXeroItems } from "../list-xero-items.handler.js";
import { createXeroItem } from "../create-xero-item.handler.js";
import { listXeroPayrollEmployees } from "../list-xero-payroll-employees.handler.js";
import { formatLineItem } from "../../helpers/format-line-item.js";
import { getPackageVersion } from "../../helpers/get-package-version.js";
import { toLineAmountTypes } from "../../helpers/to-line-amount-types.js";
import CreateManualJournalTool from "../../tools/create/create-manual-journal.tool.js";
import CreateItemTool from "../../tools/create/create-item.tool.js";
import ListItemsTool from "../../tools/list/list-items.tool.js";
import ListAccountsTool from "../../tools/list/list-accounts.tool.js";
import ListOrganisationDetailsTool from "../../tools/list/list-organisation-details.tool.js";
import ListProfitAndLossTool from "../../tools/list/list-profit-and-loss.tool.js";
import ListTrialBalanceTool from "../../tools/list/list-trial-balance.tool.js";
import ListReportBalanceSheetTool from "../../tools/list/list-report-balance-sheet.tool.js";
import CreatePaymentTool from "../../tools/create/create-payment.tool.js";

type CallableTool = {
  schema: Record<string, { parse: (value: unknown) => unknown; safeParse: (value: unknown) => { success: boolean } }>;
  handler: (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text?: string }[] }>;
};
const tool = (definition: unknown) => (definition as () => CallableTool)();
const call = (definition: unknown, args: Record<string, unknown> = {}) => tool(definition).handler(args);

beforeEach(() => {
  vi.resetAllMocks();
  client.authenticate.mockResolvedValue(undefined);
  client.getShortCode.mockResolvedValue("!test");
});

// F109
test("a provider failure reaches the caller with the MCP error flag", async () => {
  client.accountingApi.getAccounts.mockRejectedValue(new Error("Simulated Xero failure"));
  const result = await call(ListAccountsTool);
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Error listing accounts");
});

// F111
test("the package version helper matches the manifest", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf-8"));
  expect(getPackageVersion()).toBe(manifest.version);
});

// F117
test("listing items sends no page value into the unit decimal places argument", async () => {
  client.accountingApi.getItems.mockResolvedValue({ body: { items: [] } });
  await listXeroItems();
  expect(client.accountingApi.getItems).toHaveBeenCalledTimes(1);
  const args = client.accountingApi.getItems.mock.calls[0];
  expect(args[4]).toBeUndefined();
  expect(tool(ListItemsTool).schema).toEqual({});
});

// F120
test("the cash flag is described as cash transactions, not an account filter", () => {
  for (const definition of [ListProfitAndLossTool, ListTrialBalanceTool, ListReportBalanceSheetTool]) {
    const description = (tool(definition).schema.paymentsOnly as { description?: string }).description ?? "";
    expect(description).toContain("cash transactions");
    expect(description).not.toContain("accounts with payments");
  }
});

// F129
test("a tracked item submits the cost of goods sold account", async () => {
  client.accountingApi.createItems.mockResolvedValue({ body: { items: [{ itemID: "i" }] } });
  await createXeroItem({
    code: "TRACKED",
    name: "Tracked widget",
    isTrackedAsInventory: true,
    inventoryAssetAccountCode: "630",
    purchaseDetails: { unitPrice: 5, accountCode: "300", cOGSAccountCode: "310" },
  });
  const submitted = client.accountingApi.createItems.mock.calls[0][1].items[0];
  expect(submitted.purchaseDetails.cOGSAccountCode).toBe("310");
  expect(
    tool(CreateItemTool).schema.purchaseDetails.safeParse({
      unitPrice: 5,
      cOGSAccountCode: "310",
    }).success,
  ).toBe(true);
});

// F130
test("line amount types reach the SDK with its own spelling", async () => {
  expect(toLineAmountTypes("NO_TAX")).toBe(LineAmountTypes.NoTax);
  expect(toLineAmountTypes("EXCLUSIVE")).toBe(LineAmountTypes.Exclusive);
  expect(toLineAmountTypes("INCLUSIVE")).toBe(LineAmountTypes.Inclusive);
  expect(toLineAmountTypes(undefined)).toBeUndefined();

  client.accountingApi.createManualJournals.mockResolvedValue({
    body: { manualJournals: [{ manualJournalID: "m" }] },
  });
  await call(CreateManualJournalTool, {
    narration: "Fabricated journal",
    manualJournalLines: [
      { lineAmount: 100, accountCode: "200" },
      { lineAmount: -100, accountCode: "400" },
    ],
    lineAmountTypes: "NO_TAX",
  });
  const journal = client.accountingApi.createManualJournals.mock.calls[0][1].manualJournals[0];
  expect(journal.lineAmountTypes).toBe("NoTax");
  expect(journal.lineAmountTypes).not.toBe("NO_TAX");
});

// F133
test("the payroll employee list follows pagination to the last page", async () => {
  client.payrollNZApi.getEmployees
    .mockResolvedValueOnce({
      body: {
        employees: Array.from({ length: 100 }, (_, i) => ({ employeeID: `a${i}` })),
        pagination: { page: 1, pageSize: 100, pageCount: 2, itemCount: 101 },
      },
    })
    .mockResolvedValueOnce({
      body: {
        employees: [{ employeeID: "b0" }],
        pagination: { page: 2, pageSize: 100, pageCount: 2, itemCount: 101 },
      },
    });

  const result = await listXeroPayrollEmployees();
  expect(result.isError).toBe(false);
  expect(result.result?.length).toBe(101);
  expect(client.payrollNZApi.getEmployees).toHaveBeenCalledTimes(2);
  expect(client.payrollNZApi.getEmployees.mock.calls[0][2]).toBe(1);
  expect(client.payrollNZApi.getEmployees.mock.calls[1][2]).toBe(2);
});

// F134
test("line items and payment terms print their fields, not object placeholders", async () => {
  const formatted = formatLineItem({
    item: { itemID: "item-1", code: "WIDGET", name: "Widget" },
    tracking: [{ name: "Region", option: "North" }],
    lineAmount: 100,
  });
  expect(formatted).not.toContain("[object Object]");
  expect(formatted).toContain("item-1");
  expect(formatted).toContain("Region: North");

  client.accountingApi.getOrganisations.mockResolvedValue({
    body: {
      organisations: [
        {
          name: "Fabricated Co",
          paymentTerms: { bills: { day: 20, type: "DAYSAFTERBILLDATE" } },
        },
      ],
    },
  });
  const result = await call(ListOrganisationDetailsTool);
  const text = result.content.map((c) => c.text).join("\n");
  expect(text).not.toContain("[object Object]");
  expect(text).toContain("day 20");
  expect(text).toContain("DAYSAFTERBILLDATE");
});

// F137
test("payment creation reports the invoice number the response supplies", async () => {
  client.accountingApi.createPayment.mockResolvedValue({
    body: {
      payments: [
        {
          paymentID: "pay-1",
          amount: 10,
          status: "AUTHORISED",
          invoice: { invoiceID: "inv-1", invoiceNumber: "FAKE-1" },
        },
      ],
    },
  });
  const result = await call(CreatePaymentTool, {
    idempotencyKey: "operation-one",
    invoiceId: "inv-1",
    accountId: "acct-1",
    amount: 10,
  });
  const text = result.content.map((c) => c.text).join("\n");
  expect(text).toContain("Payment created successfully");
  expect(text).toContain("Invoice Number: FAKE-1");
  expect(text).not.toContain("Invoice Number: undefined");
});
