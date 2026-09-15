import { beforeEach, expect, test, vi } from "vitest";

const client = vi.hoisted(() => ({
  tenantId: "test-tenant",
  authenticate: vi.fn(),
  accountingApi: {
    getTaxRates: vi.fn(),
    getBankTransaction: vi.fn(),
    updateBankTransaction: vi.fn(),
  },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import {
  MAX_TRANSACTIONS_PER_CALL,
  recodeXeroBankTransactionTaxType,
} from "../recode-xero-bank-transaction-tax-type.handler.js";
import RecodeBankTransactionTaxTypeTool from "../../tools/update/recode-bank-transaction-tax-type.tool.js";

type CallableTool = {
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{ isError?: boolean; content: { text?: string }[] }>;
};
const call = (definition: unknown, args: Record<string, unknown> = {}) =>
  (definition as () => CallableTool)().handler(args);

const TRANSACTION_ID = "bd6b1f1b-1a4e-4b77-9c2a-0b7a11d0a111";
const OTHER_TRANSACTION_ID = "0f6a4a1c-92cd-4b0e-8c69-4d5ca2f0b222";

function bankTransaction(overrides: Record<string, unknown> = {}) {
  return {
    bankTransactionID: TRANSACTION_ID,
    status: "AUTHORISED",
    isReconciled: false,
    date: "2026-08-31",
    reference: "Fuel",
    total: 110,
    type: "SPEND",
    bankAccount: { accountID: "acc-1" },
    lineItems: [
      {
        lineItemID: "line-1",
        description: "Fuel",
        quantity: 1,
        unitAmount: 100,
        accountCode: "429",
        taxType: "EXEMPTEXPENSES",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  client.authenticate.mockResolvedValue(undefined);
  client.accountingApi.getTaxRates.mockResolvedValue({
    body: {
      taxRates: [
        { taxType: "INPUT", name: "GST on Expenses", status: "ACTIVE" },
        { taxType: "OUTPUT", name: "GST on Income", status: "ACTIVE" },
        { taxType: "CAPEXINPUT", name: "Retired rate", status: "ARCHIVED" },
      ],
    },
  });
  client.accountingApi.getBankTransaction.mockResolvedValue({
    body: { bankTransactions: [bankTransaction()] },
  });
  client.accountingApi.updateBankTransaction.mockResolvedValue({
    body: { bankTransactions: [bankTransaction({ taxType: "INPUT" })] },
  });
});

test("an unknown tax type stops the run before anything is read or written", async () => {
  const response = await recodeXeroBankTransactionTaxType(
    [TRANSACTION_ID],
    "NOTATAXTYPE",
  );

  expect(response.isError).toBe(true);
  expect(response.error).toContain("not an active tax type");
  expect(response.error).toContain("INPUT, OUTPUT");
  expect(client.accountingApi.getBankTransaction).not.toHaveBeenCalled();
  expect(client.accountingApi.updateBankTransaction).not.toHaveBeenCalled();
});

test("a tax type that is no longer active is refused", async () => {
  const response = await recodeXeroBankTransactionTaxType(
    [TRANSACTION_ID],
    "CAPEXINPUT",
  );

  expect(response.isError).toBe(true);
  expect(client.accountingApi.updateBankTransaction).not.toHaveBeenCalled();
});

test("more transactions than the cap are refused before any call", async () => {
  const ids = Array.from(
    { length: MAX_TRANSACTIONS_PER_CALL + 1 },
    (_unused, index) => `id-${index}`,
  );

  const response = await recodeXeroBankTransactionTaxType(ids, "INPUT");

  expect(response.isError).toBe(true);
  expect(response.error).toContain("Split the batch");
  expect(client.accountingApi.getTaxRates).not.toHaveBeenCalled();
});

test("every line is sent with the new tax type and keeps its line item ID", async () => {
  const response = await recodeXeroBankTransactionTaxType(
    [TRANSACTION_ID],
    "INPUT",
  );

  const args = client.accountingApi.updateBankTransaction.mock.calls[0];
  expect(args[1]).toBe(TRANSACTION_ID);
  expect(args[2].bankTransactions[0].lineItems).toEqual([
    {
      lineItemID: "line-1",
      description: "Fuel",
      quantity: 1,
      unitAmount: 100,
      accountCode: "429",
      taxType: "INPUT",
    },
  ]);
  expect(args[2].bankTransactions[0].bankTransactionID).toBe(TRANSACTION_ID);
  expect(args[4]).toBeUndefined();
  expect(response.result?.updated).toBe(1);
});

test("unit amounts are read and written at four decimal places", async () => {
  await recodeXeroBankTransactionTaxType([TRANSACTION_ID], "INPUT");

  expect(client.accountingApi.getBankTransaction.mock.calls[0][2]).toBe(4);
  expect(client.accountingApi.updateBankTransaction.mock.calls[0][3]).toBe(4);
});

test("the tax worked out under the old rate is not sent back", async () => {
  client.accountingApi.getBankTransaction.mockResolvedValue({
    body: {
      bankTransactions: [
        bankTransaction({
          lineItems: [
            {
              lineItemID: "line-1",
              unitAmount: 100,
              accountCode: "429",
              taxType: "EXEMPTEXPENSES",
              taxAmount: 0,
            },
          ],
        }),
      ],
    },
  });

  await recodeXeroBankTransactionTaxType([TRANSACTION_ID], "INPUT");

  const sent =
    client.accountingApi.updateBankTransaction.mock.calls[0][2]
      .bankTransactions[0];
  expect(sent.lineItems[0]).toEqual({
    lineItemID: "line-1",
    unitAmount: 100,
    accountCode: "429",
    taxType: "INPUT",
  });
  expect(sent.lineItems[0]).not.toHaveProperty("taxAmount");
});

test("a reconciled transaction is left alone and reported as blocked", async () => {
  client.accountingApi.getBankTransaction.mockResolvedValue({
    body: { bankTransactions: [bankTransaction({ isReconciled: true })] },
  });

  const response = await recodeXeroBankTransactionTaxType(
    [TRANSACTION_ID],
    "INPUT",
  );

  expect(client.accountingApi.updateBankTransaction).not.toHaveBeenCalled();
  expect(response.result?.blocked).toBe(1);
  expect(response.result?.results[0].detail).toContain("Unreconcile it in Xero");
});

test("a voided transaction is left alone and reported as blocked", async () => {
  client.accountingApi.getBankTransaction.mockResolvedValue({
    body: { bankTransactions: [bankTransaction({ status: "VOIDED" })] },
  });

  const response = await recodeXeroBankTransactionTaxType(
    [TRANSACTION_ID],
    "INPUT",
  );

  expect(client.accountingApi.updateBankTransaction).not.toHaveBeenCalled();
  expect(response.result?.blocked).toBe(1);
  expect(response.result?.results[0].detail).toContain("VOIDED");
});

test("a transaction already on the tax type is not written again", async () => {
  client.accountingApi.getBankTransaction.mockResolvedValue({
    body: {
      bankTransactions: [
        bankTransaction({
          lineItems: [
            { lineItemID: "line-1", taxType: "INPUT" },
            { lineItemID: "line-2", taxType: "INPUT" },
          ],
        }),
      ],
    },
  });

  const response = await recodeXeroBankTransactionTaxType(
    [TRANSACTION_ID],
    "INPUT",
  );

  expect(client.accountingApi.updateBankTransaction).not.toHaveBeenCalled();
  expect(response.result?.alreadyCorrect).toBe(1);
});

test("a transaction with a mix of tax types is recoded", async () => {
  client.accountingApi.getBankTransaction.mockResolvedValue({
    body: {
      bankTransactions: [
        bankTransaction({
          lineItems: [
            { lineItemID: "line-1", taxType: "INPUT" },
            { lineItemID: "line-2", taxType: "EXEMPTEXPENSES" },
          ],
        }),
      ],
    },
  });

  const response = await recodeXeroBankTransactionTaxType(
    [TRANSACTION_ID],
    "INPUT",
  );

  const sent =
    client.accountingApi.updateBankTransaction.mock.calls[0][2]
      .bankTransactions[0];
  expect(sent.lineItems.map((line: { taxType: string }) => line.taxType)).toEqual([
    "INPUT",
    "INPUT",
  ]);
  expect(response.result?.updated).toBe(1);
});

test("a transaction with no line items fails without a write", async () => {
  client.accountingApi.getBankTransaction.mockResolvedValue({
    body: { bankTransactions: [bankTransaction({ lineItems: [] })] },
  });

  const response = await recodeXeroBankTransactionTaxType(
    [TRANSACTION_ID],
    "INPUT",
  );

  expect(client.accountingApi.updateBankTransaction).not.toHaveBeenCalled();
  expect(response.result?.failed).toBe(1);
  expect(response.result?.results[0].detail).toBe("No line items to recode");
});

test("one failure does not stop the rest of the batch", async () => {
  client.accountingApi.getBankTransaction
    .mockRejectedValueOnce(new Error("Simulated Xero failure"))
    .mockResolvedValueOnce({
      body: {
        bankTransactions: [
          bankTransaction({ bankTransactionID: OTHER_TRANSACTION_ID }),
        ],
      },
    });

  const response = await recodeXeroBankTransactionTaxType(
    [TRANSACTION_ID, OTHER_TRANSACTION_ID],
    "INPUT",
  );

  expect(response.result?.failed).toBe(1);
  expect(response.result?.updated).toBe(1);
  expect(client.accountingApi.updateBankTransaction).toHaveBeenCalledTimes(1);
});

test("a repeated ID is only acted on once", async () => {
  await recodeXeroBankTransactionTaxType(
    [TRANSACTION_ID, TRANSACTION_ID],
    "INPUT",
  );

  expect(client.accountingApi.getBankTransaction).toHaveBeenCalledTimes(1);
  expect(client.accountingApi.updateBankTransaction).toHaveBeenCalledTimes(1);
});

test("the tool reports the counts and each outcome", async () => {
  const result = await call(RecodeBankTransactionTaxTypeTool, {
    bankTransactionIds: [TRANSACTION_ID],
    taxType: "INPUT",
  });

  expect(result.isError).toBeUndefined();
  expect(result.content[0].text).toContain("Recoded to INPUT:");
  expect(result.content[0].text).toContain("1 updated");
  expect(result.content[1].text).toContain("Outcome: updated");
  expect(result.content[1].text).toContain("1 line item set to INPUT");
});

test("a rejected run reaches the caller with the MCP error flag", async () => {
  client.accountingApi.getTaxRates.mockRejectedValue(
    new Error("Simulated Xero failure"),
  );

  const result = await call(RecodeBankTransactionTaxTypeTool, {
    bankTransactionIds: [TRANSACTION_ID],
    taxType: "INPUT",
  });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Error recoding bank transactions");
});
