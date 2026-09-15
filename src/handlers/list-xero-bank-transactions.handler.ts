import { xeroClient } from "../clients/xero-client.js";
import { BankTransaction } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { toGuidFilter } from "../helpers/xero-guid.js";
import { assertDateRange, toXeroDateFilter } from "../helpers/xero-date.js";

async function getBankTransactions(
  page: number,
  bankAccountId?: string,
  contactId?: string,
  fromDate?: string,
  toDate?: string,
): Promise<BankTransaction[]> {
  const conditions: string[] = [];

  // Every filter is checked when it is supplied, empty string included: an
  // empty value that fell through to "no filter" would quietly answer a
  // question about one contact or period with the whole account.
  if (bankAccountId !== undefined) {
    conditions.push(
      `BankAccount.AccountID=${toGuidFilter("bankAccountId", bankAccountId)}`,
    );
  }

  if (contactId !== undefined) {
    conditions.push(`Contact.ContactID==${toGuidFilter("contactId", contactId)}`);
  }

  if (fromDate !== undefined && toDate !== undefined) {
    assertDateRange(fromDate, toDate);
  }

  if (fromDate !== undefined) {
    conditions.push(`Date >= ${toXeroDateFilter("fromDate", fromDate)}`);
  }

  if (toDate !== undefined) {
    conditions.push(`Date <= ${toXeroDateFilter("toDate", toDate)}`);
  }

  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.getBankTransactions(xeroClient.tenantId,
      undefined, // ifModifiedSince
      conditions.length > 0 ? conditions.join(" AND ") : undefined, // where
      "Date DESC", // order
      page, // page
      undefined, // unitdp
      10, // pagesize
      getClientHeaders()
  );

  return response.body.bankTransactions ?? [];
}

export async function listXeroBankTransactions(
  page: number = 1,
  bankAccountId?: string,
  contactId?: string,
  fromDate?: string,
  toDate?: string
): Promise<XeroClientResponse<BankTransaction[]>> {
  try {
    const bankTransactions = await getBankTransactions(
      page,
      bankAccountId,
      contactId,
      fromDate,
      toDate,
    );

    return {
      result: bankTransactions,
      isError: false,
      error: null
    }
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error)
    }
  }
}
