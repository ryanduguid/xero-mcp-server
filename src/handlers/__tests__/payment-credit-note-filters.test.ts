import { beforeEach, expect, test, vi } from "vitest";

const client = vi.hoisted(() => ({
  tenantId: "test-tenant",
  authenticate: vi.fn(),
  accountingApi: { getPayments: vi.fn(), getCreditNotes: vi.fn() },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import { listXeroPayments } from "../list-xero-payments.handler.js";
import { listXeroCreditNotes } from "../list-xero-credit-notes.handler.js";

const INVOICE_ID = "6f7594f2-f059-4d56-9e67-47ac9733bfe9";
const PAYMENT_ID = "4ff1e5cc-9835-40d5-bb18-09fdb118db9c";
const CONTACT_ID = "0e5c2b47-4c1f-4a7e-9a2d-1f3b8c6d7e90";

const paymentsWhere = () => client.accountingApi.getPayments.mock.calls[0][2];
const creditNotesWhere = () =>
  client.accountingApi.getCreditNotes.mock.calls[0][2];

beforeEach(() => {
  vi.resetAllMocks();
  client.authenticate.mockResolvedValue(undefined);
  client.accountingApi.getPayments.mockResolvedValue({
    body: { payments: [] },
  });
  client.accountingApi.getCreditNotes.mockResolvedValue({
    body: { creditNotes: [] },
  });
});

test("payment filters are rendered as guid and string literals joined by AND", async () => {
  await listXeroPayments(1, {
    invoiceId: INVOICE_ID,
    invoiceNumber: "INV-0042",
    paymentId: PAYMENT_ID,
    reference: "Smith & Co's July rent",
  });

  expect(paymentsWhere()).toBe(
    `Invoice.InvoiceID==guid("${INVOICE_ID}") AND ` +
      `Invoice.InvoiceNumber=="INV-0042" AND ` +
      `PaymentID==guid("${PAYMENT_ID}") AND ` +
      `Reference=="Smith & Co's July rent"`,
  );
});

test("no payment filters send no where clause", async () => {
  await listXeroPayments(1, {});

  expect(paymentsWhere()).toBeUndefined();
});

test("a payment or invoice ID that is not a UUID never reaches a where clause", async () => {
  const injection = `${PAYMENT_ID}") OR 1==1 OR ("`;

  const byPayment = await listXeroPayments(1, { paymentId: injection });
  const byInvoice = await listXeroPayments(1, { invoiceId: injection });

  expect(byPayment.isError).toBe(true);
  expect(byPayment.error).toContain("paymentId must be a Xero UUID");
  expect(byInvoice.isError).toBe(true);
  expect(byInvoice.error).toContain("invoiceId must be a Xero UUID");
  expect(client.accountingApi.getPayments).not.toHaveBeenCalled();
});

test("a quote or backslash in an invoice number or reference is refused", async () => {
  const values = ['INV-1" OR Amount>"0', "INV-1\\", 'say "hi"'];

  for (const value of values) {
    const byNumber = await listXeroPayments(1, { invoiceNumber: value });
    const byReference = await listXeroPayments(1, { reference: value });

    expect(byNumber.isError).toBe(true);
    expect(byNumber.error).toContain("invoiceNumber cannot contain");
    expect(byReference.isError).toBe(true);
    expect(byReference.error).toContain("reference cannot contain");
  }
  expect(client.accountingApi.getPayments).not.toHaveBeenCalled();
});

test("an empty payment filter is an error, not a wider query", async () => {
  for (const field of [
    "invoiceId",
    "invoiceNumber",
    "paymentId",
    "reference",
  ] as const) {
    const response = await listXeroPayments(1, { [field]: "" });

    expect(response.isError).toBe(true);
    expect(response.error).toContain(field);
  }
  expect(client.accountingApi.getPayments).not.toHaveBeenCalled();
});

test("a credit note contact filter is rendered as a guid literal", async () => {
  await listXeroCreditNotes(1, CONTACT_ID);

  expect(creditNotesWhere()).toBe(`Contact.ContactID=guid("${CONTACT_ID}")`);
});

test("no credit note contact sends no where clause", async () => {
  await listXeroCreditNotes(1);

  expect(creditNotesWhere()).toBeUndefined();
});

test("a credit note contact that is not a UUID never reaches a where clause", async () => {
  const injection = `${CONTACT_ID}") OR 1==1 OR ("`;

  const injected = await listXeroCreditNotes(1, injection);
  const empty = await listXeroCreditNotes(1, "");

  expect(injected.isError).toBe(true);
  expect(injected.error).toContain("contactId must be a Xero UUID");
  expect(empty.isError).toBe(true);
  expect(empty.error).toContain("contactId must be a Xero UUID");
  expect(client.accountingApi.getCreditNotes).not.toHaveBeenCalled();
});
