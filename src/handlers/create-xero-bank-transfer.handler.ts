import { xeroClient } from "../clients/xero-client.js";
import { BankTransfer } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { assertIsoDate, todayIsoDate } from "../helpers/xero-date.js";

async function createBankTransfer(
  idempotencyKey: string,
  fromBankAccountId: string,
  toBankAccountId: string,
  amount: number,
  date?: string,
): Promise<BankTransfer | undefined> {
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new Error("An operation idempotency key of 1 to 128 characters is required. Reuse it for retries.");
  }

  if (!(amount > 0)) {
    throw new Error("amount must be greater than zero");
  }

  if (fromBankAccountId === toBankAccountId) {
    throw new Error(
      "fromBankAccountId and toBankAccountId must be different accounts",
    );
  }

  if (date) {
    assertIsoDate("date", date);
  }

  await xeroClient.authenticate();

  const bankTransfer: BankTransfer = {
    fromBankAccount: {
      accountID: fromBankAccountId,
    },
    toBankAccount: {
      accountID: toBankAccountId,
    },
    amount: amount,
    date: date ?? todayIsoDate(),
  };

  const response = await xeroClient.accountingApi.createBankTransfer(
    xeroClient.tenantId, // xeroTenantId
    {
      bankTransfers: [bankTransfer],
    }, // bankTransfers
    idempotencyKey, // idempotencyKey
    getClientHeaders(),
  );

  return response.body.bankTransfers?.[0];
}

/**
 * Move money between two of the organisation's own bank accounts.
 *
 * Xero rejects a transfer between accounts in different currencies, and both
 * accounts must be of type BANK.
 *
 * The caller supplies the idempotency key so a retry after a lost response
 * cannot post the transfer, and its pair of ledger transactions, twice.
 */
export async function createXeroBankTransfer(
  idempotencyKey: string,
  fromBankAccountId: string,
  toBankAccountId: string,
  amount: number,
  date?: string,
): Promise<XeroClientResponse<BankTransfer>> {
  try {
    const bankTransfer = await createBankTransfer(
      idempotencyKey,
      fromBankAccountId,
      toBankAccountId,
      amount,
      date,
    );

    if (!bankTransfer) {
      throw new Error("Bank transfer creation failed.");
    }

    return {
      result: bankTransfer,
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
