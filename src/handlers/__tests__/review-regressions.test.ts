import { beforeEach, expect, test, vi } from "vitest";
import { Invoice, Address } from "xero-node";
import { z } from "zod";

const client = vi.hoisted(() => ({
  tenantId: "test-tenant",
  authenticate: vi.fn(),
  getShortCode: vi.fn(),
  payrollNZApi: { getEmployeeLeaveTypes: vi.fn(), getEmployeeLeavePeriods: vi.fn() },
  accountingApi: Object.fromEntries([
    "createPayment", "createTrackingOptions", "getTrackingCategory", "updateTrackingOptions",
    "updateTrackingCategory", "createTrackingCategory", "createInvoices", "createItems", "updateItem",
    "getQuote", "getInvoice", "getCreditNote", "updateQuote", "updateInvoice", "updateCreditNote",
    "updateContact", "getReportProfitAndLoss", "createManualJournals", "getInvoices",
    "getOrganisations", "getBankTransactions", "getManualJournals", "getContactGroups",
  ].map(name => [name, vi.fn()])),
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import { createXeroPayment } from "../create-xero-payment.handler.js";
import { createXeroTrackingOptions } from "../create-xero-tracking-option.handler.js";
import { updateXeroTrackingOption } from "../update-xero-tracking-options.handler.js";
import { updateXeroTrackingCategory } from "../update-xero-tracking-category.handler.js";
import { createXeroTrackingCategory } from "../create-xero-tracking-category.handler.js";
import { createXeroInvoice } from "../create-xero-invoice.handler.js";
import { createXeroItem } from "../create-xero-item.handler.js";
import { updateXeroItem } from "../update-xero-item.handler.js";
import { updateXeroQuote } from "../update-xero-quote.handler.js";
import { updateXeroInvoice } from "../update-xero-invoice.handler.js";
import { updateXeroCreditNote } from "../update-xero-credit-note.handler.js";
import { updateXeroContact } from "../update-xero-contact.handler.js";
import { listXeroProfitAndLoss } from "../list-xero-profit-and-loss.handler.js";
import { DeepLinkType, getDeepLink } from "../../helpers/get-deeplink.js";
import { bankTransactionDeepLink, invoiceDeepLink, contactDeepLink } from "../../consts/deeplinks.js";
import CreatePaymentTool from "../../tools/create/create-payment.tool.js";
import CreateInvoiceTool from "../../tools/create/create-invoice.tool.js";
import CreateManualJournalTool from "../../tools/create/create-manual-journal.tool.js";
import CreateTrackingOptionsTool from "../../tools/create/create-tracking-options.tool.js";
import ListInvoicesTool from "../../tools/list/list-invoices.tool.js";
import ListOrganisationDetailsTool from "../../tools/list/list-organisation-details.tool.js";
import ListContactGroupsTool from "../../tools/list/list-contact-groups.tool.js";
import ListManualJournalsTool from "../../tools/list/list-manual-journals.tool.js";
import ListPayrollEmployeeLeaveTypesTool from "../../tools/list/list-payroll-employee-leave-types.tool.js";
import ListPayrollLeavePeriodsTool from "../../tools/list/list-payroll-leave-periods.tool.js";

type CallableTool = { handler: (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text?: string }[] }> };
const call = (tool: unknown, args: Record<string, unknown> = {}) => (tool as CallableTool).handler(args);

beforeEach(() => {
  vi.resetAllMocks();
  client.authenticate.mockResolvedValue(undefined);
  client.getShortCode.mockResolvedValue("!test");
});

test("payment retries keep the caller operation key; separate payments can use identical fields", async () => {
  client.accountingApi.createPayment.mockResolvedValue({ body: { payments: [{ paymentID: "p" }] } });
  const details = { invoiceId: "i", accountId: "a", amount: 10, date: "2026-01-31" };
  for (const idempotencyKey of ["operation-one", "operation-one", "operation-two"]) {
    expect((await createXeroPayment({ ...details, idempotencyKey })).isError).toBe(false);
  }
  expect(client.accountingApi.createPayment.mock.calls.map(args => args[2])).toEqual([
    "operation-one", "operation-one", "operation-two",
  ]);
  expect((await createXeroPayment({ ...details, idempotencyKey: "" })).isError).toBe(true);
  expect(client.accountingApi.createPayment).toHaveBeenCalledTimes(3);
  const schema = z.object(CreatePaymentTool().schema as z.ZodRawShape);
  expect(schema.safeParse(details).success).toBe(false);
});

test("tracking batches retain successful outcomes and reuse failed option keys on subset retries", async () => {
  client.accountingApi.createTrackingOptions.mockImplementation(async (_tenant, _category, option) => {
    if (option.name === "B") throw new Error("temporary failure");
    return { body: { options: [{ name: option.name, trackingOptionID: "a" }] } };
  });
  const result = await createXeroTrackingOptions("category", ["A", "B"], "batch-one");
  expect(result.isError).toBe(false);
  if (result.isError) throw new Error(result.error);
  expect(result.result[0].option?.name).toBe("A");
  expect(result.result[1].error).toContain("temporary failure");
  const failedKey = result.result[1].idempotencyKey;
  client.accountingApi.createTrackingOptions.mockResolvedValue({ body: { options: [{ name: "B" }] } });
  await createXeroTrackingOptions("category", ["B"], "batch-one");
  expect(client.accountingApi.createTrackingOptions.mock.lastCall?.[3]).toBe(failedKey);
  await createXeroTrackingOptions("category", ["B"], "batch-two");
  expect(client.accountingApi.createTrackingOptions.mock.lastCall?.[3]).not.toBe(failedKey);
});

test("tracking tool displays successes and failures together", async () => {
  client.accountingApi.createTrackingOptions.mockResolvedValueOnce({ body: { options: [{ name: "A" }] } })
    .mockRejectedValueOnce(new Error("temporary failure"));
  const result = await call(CreateTrackingOptionsTool(), { trackingCategoryId: "c", optionNames: ["A", "B"], idempotencyKey: "batch" });
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("1 out of 2");
  expect(result.content[0].text).toContain("Failed: B");
  expect(result.content[0].text).toContain("Created:");
});

test("unknown tracking IDs stop the entire update before any writes", async () => {
  client.accountingApi.getTrackingCategory.mockResolvedValue({ body: { trackingCategories: [{ options: [{ trackingOptionID: "known" }] }] } });
  const result = await updateXeroTrackingOption("c", [{ trackingOptionId: "known", name: "New" }, { trackingOptionId: "missing" }]);
  expect(result.error).toContain("missing");
  expect(client.accountingApi.updateTrackingOptions).not.toHaveBeenCalled();
});

test("tracking category creation waits for authentication", async () => {
  let ready!: () => void;
  client.authenticate.mockReturnValue(new Promise<void>(resolve => { ready = resolve; }));
  client.accountingApi.createTrackingCategory.mockResolvedValue({ body: { trackingCategories: [{ name: "new" }] } });
  const pending = createXeroTrackingCategory("new");
  expect(client.accountingApi.createTrackingCategory).not.toHaveBeenCalled();
  ready();
  expect((await pending).isError).toBe(false);
});

test("updated tracking category response contains the new values", async () => {
  client.accountingApi.getTrackingCategory.mockResolvedValue({ body: { trackingCategories: [{ name: "old" }] } });
  client.accountingApi.updateTrackingCategory.mockResolvedValue({});
  expect((await updateXeroTrackingCategory("c", "new")).result?.name).toBe("new");
});

test("invoice due date follows the supplied invoice date over a month boundary", async () => {
  client.accountingApi.createInvoices.mockImplementation(async (_tenant, body) => ({ body }));
  const result = await createXeroInvoice("contact", [], Invoice.TypeEnum.ACCREC, undefined, "2024-01-31");
  expect(result.result?.dueDate).toBe("2024-03-01");
  const schema = z.object(CreateInvoiceTool().schema as z.ZodRawShape);
  expect(schema.parse({ contactId: "c", lineItems: [] }).type).toBe("ACCREC");
});

test("empty item responses are errors", async () => {
  client.accountingApi.createItems.mockResolvedValue({ body: {} });
  client.accountingApi.updateItem.mockResolvedValue({ body: { items: [] } });
  expect((await createXeroItem({ code: "c", name: "n" })).isError).toBe(true);
  expect((await updateXeroItem("i", { code: "c", name: "n" })).isError).toBe(true);
});

test.each([
  ["Quote", "getQuote", "updateQuote", updateXeroQuote],
  ["Invoice", "getInvoice", "updateInvoice", updateXeroInvoice],
  ["Credit note", "getCreditNote", "updateCreditNote", updateXeroCreditNote],
] as const)("missing %s has a not-found error without an update", async (label, getter, updater, update) => {
  client.accountingApi[getter].mockResolvedValue({ body: {} });
  expect((await update("absent")).error).toContain(`${label} not found`);
  expect(client.accountingApi[updater]).not.toHaveBeenCalled();
});

test("contact updates preserve PO box address type", async () => {
  client.accountingApi.updateContact.mockResolvedValue({ body: { contacts: [{}] } });
  await updateXeroContact("c", "Name", undefined, undefined, undefined, undefined, { addressType: Address.AddressTypeEnum.POBOX });
  expect(client.accountingApi.updateContact.mock.lastCall?.[2].contacts[0].addresses[0].addressType).toBe("POBOX");
});

test("profit and loss layout and cash basis flags keep their SDK argument positions", async () => {
  client.accountingApi.getReportProfitAndLoss.mockResolvedValue({ body: { reports: [{}] } });
  await listXeroProfitAndLoss(undefined, undefined, undefined, undefined, true, false);
  expect(client.accountingApi.getReportProfitAndLoss.mock.lastCall?.slice(9, 11)).toEqual([true, false]);
});

test("organisation lookup failure does not turn a successful payment into an error", async () => {
  client.getShortCode.mockRejectedValue(new Error("lookup failed"));
  client.accountingApi.createPayment.mockResolvedValue({ body: { payments: [{ paymentID: "p", amount: 10 }] } });
  const result = await call(CreatePaymentTool(), { invoiceId: "i", accountId: "a", amount: 10, idempotencyKey: "op" });
  expect(result.content[0].text).toContain("Payment created successfully");
  expect(result.content[0].text).not.toContain("Link to view");
  expect(await getDeepLink(DeepLinkType.MANUAL_JOURNAL, "j")).toBeNull();
});

test("bank and journal links select the organisation and preserve nested query parameters", async () => {
  const link = new URL(bankTransactionDeepLink("!org", "account&one", "bank&two"));
  expect(link.searchParams.get("shortcode")).toBe("!org");
  const target = new URL(link.searchParams.get("redirecturl")!, link.origin);
  expect(target.searchParams.get("accountID")).toBe("account&one");
  expect(target.searchParams.get("bankTransactionID")).toBe("bank&two");
  const journal = new URL((await getDeepLink(DeepLinkType.MANUAL_JOURNAL, "j"))!);
  expect(journal.searchParams.get("shortcode")).toBe("!test");
  expect(invoiceDeepLink("o", "i")).toMatch(/^https:/);
  expect(contactDeepLink("o", "c")).toMatch(/^https:/);
});

test("manual journal schema rejects fewer than two lines and formats line amounts as text", async () => {
  const line = { lineAmount: 10, accountCode: "100" };
  const schema = z.object(CreateManualJournalTool().schema as z.ZodRawShape);
  expect(schema.safeParse({ narration: "n", manualJournalLines: [line] }).success).toBe(false);
  client.accountingApi.createManualJournals.mockResolvedValue({ body: { manualJournals: [{ narration: "n", journalLines: [line, { ...line, lineAmount: -10 }] }] } });
  const result = await call(CreateManualJournalTool(), { narration: "n", manualJournalLines: [line, { ...line, lineAmount: -10 }] });
  expect(result.content[0].text).toContain("Line Amount: -10");
  expect(result.content[0].text).not.toContain("[object Object]");
});

test("invoice display retains paid and credited zero balances", async () => {
  client.accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [{ amountDue: 0, amountPaid: 0, amountCredited: 0 }] } });
  const result = await call(ListInvoicesTool(), { page: 1 });
  const text = result.content.map(item => item.text).join("\n");
  for (const label of ["Amount Due", "Amount Paid", "Amount Credited"]) expect(text).toContain(`${label}: 0`);
});

test("organisation fallback text is evaluated rather than printed as code", async () => {
  client.accountingApi.getOrganisations.mockResolvedValue({ body: { organisations: [{}] } });
  const text = (await call(ListOrganisationDetailsTool())).content.map(item => item.text).join("\n");
  expect(text).toContain("Name: No name available.");
  expect(text).not.toContain("undefined");
  expect(text).not.toContain("||");
});

test("empty contact groups and manual journals show their empty-state labels", async () => {
  client.accountingApi.getContactGroups.mockResolvedValue({ body: { contactGroups: [{ contacts: [] }] } });
  client.accountingApi.getManualJournals.mockResolvedValue({ body: { manualJournals: [{ journalLines: [] }] } });
  expect((await call(ListContactGroupsTool())).content[1].text).toContain("No contacts in this contact group.");
  expect((await call(ListManualJournalsTool())).content[1].text).toContain("No journal lines");
});

test("leave entitlement zero values are visible and period units have distinct labels", async () => {
  client.payrollNZApi.getEmployeeLeaveTypes.mockResolvedValue({ body: { leaveTypes: [{
    unitsAccruedAnnually: 0, maximumToAccrue: 0, openingBalance: 0, rateAccruedHourly: 0,
  }] } });
  const text = (await call(ListPayrollEmployeeLeaveTypesTool(), { employeeId: "e" })).content[1].text;
  for (const label of ["Units Accrued Annually", "Maximum To Accrue", "Opening Balance", "Rate Accrued Hourly"]) expect(text).toContain(`${label}: 0`);
  client.payrollNZApi.getEmployeeLeavePeriods.mockResolvedValue({ body: { periods: [{
    numberOfUnits: 0, numberOfUnitsTaken: 0, typeOfUnits: "Hours", typeOfUnitsTaken: "Hours", periodStatus: "Approved",
  }] } });
  const period = (await call(ListPayrollLeavePeriodsTool(), { employeeId: "e" })).content[1].text!;
  expect(period).toContain("Number of Units Taken: 0");
  expect(period).toContain("Type of Units Taken: Hours");
  expect(period).not.toContain("Payment Date");
  expect(period.match(/Period Status/g)).toHaveLength(1);
});
