import { xeroClient } from "../clients/xero-client.js";
import { BankTransfer } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { assertIsoDate } from "../helpers/xero-date.js";

async function createBankTransfer(
  fromBankAccountId: string,
  toBankAccountId: string,
  amount: number,
  date?: string,
): Promise<BankTransfer | undefined> {
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
    date: date ?? new Date().toISOString().split("T")[0],
  };

  const response = await xeroClient.accountingApi.createBankTransfer(
    xeroClient.tenantId, // xeroTenantId
    {
      bankTransfers: [bankTransfer],
    }, // bankTransfers
    undefined, // idempotencyKey
    getClientHeaders(),
  );

  return response.body.bankTransfers?.[0];
}

/**
 * Move money between two of the organisation's own bank accounts.
 *
 * Xero rejects a transfer between accounts in different currencies, and both
 * accounts must be of type BANK.
 */
export async function createXeroBankTransfer(
  fromBankAccountId: string,
  toBankAccountId: string,
  amount: number,
  date?: string,
): Promise<XeroClientResponse<BankTransfer>> {
  try {
    const bankTransfer = await createBankTransfer(
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
