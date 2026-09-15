import { beforeEach, expect, test, vi } from "vitest";

const client = vi.hoisted(() => ({
  tenantId: "test-tenant",
  authenticate: vi.fn(),
  accountingApi: {
    getBankTransfers: vi.fn(),
    createBankTransfer: vi.fn(),
  },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import { listXeroBankTransfers } from "../list-xero-bank-transfers.handler.js";
import { createXeroBankTransfer } from "../create-xero-bank-transfer.handler.js";
import ListBankTransfersTool from "../../tools/list/list-bank-transfers.tool.js";
import CreateBankTransferTool from "../../tools/create/create-bank-transfer.tool.js";

type CallableTool = {
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{ isError?: boolean; content: { text?: string }[] }>;
};
const call = (definition: unknown, args: Record<string, unknown> = {}) =>
  (definition as () => CallableTool)().handler(args);

beforeEach(() => {
  vi.resetAllMocks();
  client.authenticate.mockResolvedValue(undefined);
});

test("a date range becomes a bounded where clause", async () => {
  client.accountingApi.getBankTransfers.mockResolvedValue({
    body: { bankTransfers: [] },
  });

  await listXeroBankTransfers("2026-07-01", "2026-09-30");

  const args = client.accountingApi.getBankTransfers.mock.calls[0];
  expect(args[2]).toBe(
    "Date >= DateTime(2026,7,1) AND Date <= DateTime(2026,9,30)",
  );
  expect(args[3]).toBe("Date DESC");
});

test("no date range sends no where clause", async () => {
  client.accountingApi.getBankTransfers.mockResolvedValue({
    body: { bankTransfers: [] },
  });

  await listXeroBankTransfers();

  expect(client.accountingApi.getBankTransfers.mock.calls[0][2]).toBeUndefined();
});

test("a date that is not on the calendar never reaches Xero", async () => {
  const response = await listXeroBankTransfers("2026-02-31");

  expect(response.isError).toBe(true);
  expect(response.error).toContain("not a date on the calendar");
  expect(client.accountingApi.getBankTransfers).not.toHaveBeenCalled();
});

test("filter syntax in a date is rejected instead of injected", async () => {
  const response = await listXeroBankTransfers(
    '2026-07-01) OR (Amount > 0',
  );

  expect(response.isError).toBe(true);
  expect(response.error).toContain("YYYY-MM-DD");
  expect(client.accountingApi.getBankTransfers).not.toHaveBeenCalled();
});

test("an empty date is an error, not an unfiltered listing", async () => {
  const response = await listXeroBankTransfers("");

  expect(response.isError).toBe(true);
  expect(response.error).toContain("YYYY-MM-DD");
  expect(client.accountingApi.getBankTransfers).not.toHaveBeenCalled();
});

test("a reversed date range is refused rather than read as no activity", async () => {
  const response = await listXeroBankTransfers("2026-09-30", "2026-07-01");

  expect(response.isError).toBe(true);
  expect(response.error).toContain("is after toDate");
  expect(client.accountingApi.getBankTransfers).not.toHaveBeenCalled();
});

test("a created transfer sends both account IDs, the amount and the caller's key", async () => {
  client.accountingApi.createBankTransfer.mockResolvedValue({
    body: { bankTransfers: [{ bankTransferID: "bt-1" }] },
  });

  await createXeroBankTransfer(
    "transfer-key-1",
    "acc-from",
    "acc-to",
    250.5,
    "2026-08-31",
  );

  const args = client.accountingApi.createBankTransfer.mock.calls[0];
  expect(args[1]).toEqual({
    bankTransfers: [
      {
        fromBankAccount: { accountID: "acc-from" },
        toBankAccount: { accountID: "acc-to" },
        amount: 250.5,
        date: "2026-08-31",
      },
    ],
  });
  expect(args[2]).toBe("transfer-key-1");
});

test("a retry with the same key reaches Xero with that key, not a new one", async () => {
  client.accountingApi.createBankTransfer.mockResolvedValue({
    body: { bankTransfers: [{ bankTransferID: "bt-1" }] },
  });

  await createXeroBankTransfer("transfer-key-1", "acc-from", "acc-to", 10);
  await createXeroBankTransfer("transfer-key-1", "acc-from", "acc-to", 10);

  const keys = client.accountingApi.createBankTransfer.mock.calls.map(
    (call: unknown[]) => call[2],
  );
  expect(keys).toEqual(["transfer-key-1", "transfer-key-1"]);
});

test("a missing or oversized key is refused before the write", async () => {
  for (const key of ["", "k".repeat(129)]) {
    const response = await createXeroBankTransfer(
      key,
      "acc-from",
      "acc-to",
      10,
    );

    expect(response.isError).toBe(true);
    expect(response.error).toContain("idempotency key of 1 to 128 characters");
  }

  expect(client.accountingApi.createBankTransfer).not.toHaveBeenCalled();
});

test("an omitted date defaults to today", async () => {
  client.accountingApi.createBankTransfer.mockResolvedValue({
    body: { bankTransfers: [{ bankTransferID: "bt-1" }] },
  });

  await createXeroBankTransfer("transfer-key-1", "acc-from", "acc-to", 10);

  const sent = client.accountingApi.createBankTransfer.mock.calls[0][1];
  expect(sent.bankTransfers[0].date).toBe(
    new Date().toISOString().split("T")[0],
  );
});

test("a date that is not on the calendar is refused before the write", async () => {
  const response = await createXeroBankTransfer(
    "transfer-key-1",
    "acc-from",
    "acc-to",
    10,
    "2026-02-31",
  );

  expect(response.isError).toBe(true);
  expect(response.error).toContain("not a date on the calendar");
  expect(client.accountingApi.createBankTransfer).not.toHaveBeenCalled();
});

test("a transfer to the same account is refused before the write", async () => {
  const response = await createXeroBankTransfer(
    "transfer-key-1",
    "acc-same",
    "acc-same",
    10,
  );

  expect(response.isError).toBe(true);
  expect(response.error).toContain("must be different accounts");
  expect(client.accountingApi.createBankTransfer).not.toHaveBeenCalled();
});

test("a non-positive amount is refused before the write", async () => {
  for (const amount of [0, -5]) {
    const response = await createXeroBankTransfer(
      "transfer-key-1",
      "acc-from",
      "acc-to",
      amount,
    );

    expect(response.isError).toBe(true);
    expect(response.error).toContain("greater than zero");
  }

  expect(client.accountingApi.createBankTransfer).not.toHaveBeenCalled();
});

test("a provider failure reaches the caller with the MCP error flag", async () => {
  client.accountingApi.getBankTransfers.mockRejectedValue(
    new Error("Simulated Xero failure"),
  );

  const result = await call(ListBankTransfersTool);

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Error listing bank transfers");
});

test("a rejected write reaches the caller with the MCP error flag", async () => {
  client.accountingApi.createBankTransfer.mockRejectedValue(
    new Error("Simulated Xero failure"),
  );

  const result = await call(CreateBankTransferTool, {
    idempotencyKey: "transfer-key-1",
    fromBankAccountId: "acc-from",
    toBankAccountId: "acc-to",
    amount: 10,
  });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Error creating bank transfer");
});
