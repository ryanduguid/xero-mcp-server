import { xeroClient } from "../clients/xero-client.js";
import { BankTransfer } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { assertDateRange, toXeroDateFilter } from "../helpers/xero-date.js";

async function getBankTransfers(
  fromDate?: string,
  toDate?: string,
): Promise<BankTransfer[]> {
  const conditions: string[] = [];

  if (fromDate !== undefined && toDate !== undefined) {
    assertDateRange(fromDate, toDate);
  }

  // A supplied date is checked even when it is empty, so an empty value
  // cannot fall through to an unfiltered listing.
  if (fromDate !== undefined) {
    conditions.push(`Date >= ${toXeroDateFilter("fromDate", fromDate)}`);
  }

  if (toDate !== undefined) {
    conditions.push(`Date <= ${toXeroDateFilter("toDate", toDate)}`);
  }

  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.getBankTransfers(
    xeroClient.tenantId, // xeroTenantId
    undefined, // ifModifiedSince
    conditions.length > 0 ? conditions.join(" AND ") : undefined, // where
    "Date DESC", // order
    getClientHeaders(),
  );

  return response.body.bankTransfers ?? [];
}

/**
 * List bank transfers, which move money between the organisation's own bank
 * accounts. The Xero endpoint returns every transfer at once, so the date
 * range is the only way to keep a long-running organisation readable.
 */
export async function listXeroBankTransfers(
  fromDate?: string,
  toDate?: string,
): Promise<XeroClientResponse<BankTransfer[]>> {
  try {
    const bankTransfers = await getBankTransfers(fromDate, toDate);

    return {
      result: bankTransfers,
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
