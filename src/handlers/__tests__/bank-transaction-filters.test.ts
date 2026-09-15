import { beforeEach, expect, test, vi } from "vitest";

const client = vi.hoisted(() => ({
  tenantId: "test-tenant",
  authenticate: vi.fn(),
  accountingApi: { getBankTransactions: vi.fn() },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import { listXeroBankTransactions } from "../list-xero-bank-transactions.handler.js";

const ACCOUNT_ID = "6f7594f2-f059-4d56-9e67-47ac9733bfe9";
const CONTACT_ID = "4ff1e5cc-9835-40d5-bb18-09fdb118db9c";

const whereOf = (callIndex = 0) =>
  client.accountingApi.getBankTransactions.mock.calls[callIndex][2];

beforeEach(() => {
  vi.resetAllMocks();
  client.authenticate.mockResolvedValue(undefined);
  client.accountingApi.getBankTransactions.mockResolvedValue({
    body: { bankTransactions: [] },
  });
});

test("the bank account clause is unchanged when it is the only filter", async () => {
  await listXeroBankTransactions(1, ACCOUNT_ID);

  expect(whereOf()).toBe(`BankAccount.AccountID=guid("${ACCOUNT_ID}")`);
});

test("every filter is combined with AND", async () => {
  await listXeroBankTransactions(
    1,
    ACCOUNT_ID,
    CONTACT_ID,
    "2026-07-01",
    "2026-09-30",
  );

  expect(whereOf()).toBe(
    `BankAccount.AccountID=guid("${ACCOUNT_ID}") AND ` +
      `Contact.ContactID==guid("${CONTACT_ID}") AND ` +
      "Date >= DateTime(2026,7,1) AND Date <= DateTime(2026,9,30)",
  );
});

test("a contact on its own still filters", async () => {
  await listXeroBankTransactions(1, undefined, CONTACT_ID);

  expect(whereOf()).toBe(`Contact.ContactID==guid("${CONTACT_ID}")`);
});

test("no filters send no where clause and keep the paging arguments", async () => {
  await listXeroBankTransactions(2);

  const args = client.accountingApi.getBankTransactions.mock.calls[0];
  expect(args[2]).toBeUndefined();
  expect(args[3]).toBe("Date DESC");
  expect(args[4]).toBe(2);
  expect(args[5]).toBeUndefined();
  expect(args[6]).toBe(10);
});

test("an identifier that is not a UUID never reaches a where clause", async () => {
  const injection = `${CONTACT_ID}") OR Total>guid("0`;

  const byContact = await listXeroBankTransactions(1, undefined, injection);
  const byAccount = await listXeroBankTransactions(1, injection);

  expect(byContact.isError).toBe(true);
  expect(byContact.error).toContain("must be a Xero UUID");
  expect(byAccount.isError).toBe(true);
  expect(client.accountingApi.getBankTransactions).not.toHaveBeenCalled();
});

test("an empty filter value is an error, not a wider query", async () => {
  const byContact = await listXeroBankTransactions(1, undefined, "");
  const byAccount = await listXeroBankTransactions(1, "");
  const byFromDate = await listXeroBankTransactions(1, undefined, undefined, "");
  const byToDate = await listXeroBankTransactions(
    1,
    undefined,
    undefined,
    undefined,
    "",
  );

  expect(byContact.error).toContain("must be a Xero UUID");
  expect(byAccount.error).toContain("must be a Xero UUID");
  expect(byFromDate.error).toContain("YYYY-MM-DD");
  expect(byToDate.error).toContain("YYYY-MM-DD");
  expect(client.accountingApi.getBankTransactions).not.toHaveBeenCalled();
});

test("a reversed date range is refused rather than read as no activity", async () => {
  const response = await listXeroBankTransactions(
    1,
    undefined,
    undefined,
    "2026-09-30",
    "2026-07-01",
  );

  expect(response.isError).toBe(true);
  expect(response.error).toContain("is after toDate");
  expect(client.accountingApi.getBankTransactions).not.toHaveBeenCalled();
});

test("a date that is not on the calendar never reaches a where clause", async () => {
  const response = await listXeroBankTransactions(
    1,
    undefined,
    undefined,
    "2026-02-31",
  );

  expect(response.isError).toBe(true);
  expect(response.error).toContain("not a date on the calendar");
  expect(client.accountingApi.getBankTransactions).not.toHaveBeenCalled();
});
