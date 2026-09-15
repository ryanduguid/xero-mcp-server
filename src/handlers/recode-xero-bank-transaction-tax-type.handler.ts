import { xeroClient } from "../clients/xero-client.js";
import { BankTransaction, TaxRate } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { listXeroTaxRates } from "./list-xero-tax-rates.handler.js";

/**
 * Each transaction costs one read and one write, plus one tax rate read per
 * call, so one batch of this size fits inside Xero's 60 calls a minute. Two
 * batches inside the same minute do not, which is why the refusal below tells
 * the caller to wait rather than run straight on.
 */
export const MAX_TRANSACTIONS_PER_CALL = 20;

/**
 * Read and write unit amounts at four decimal places. The default is two, and
 * this handler sends the transaction it just read back to Xero, so a tax-only
 * recode would otherwise round a three or four decimal unit price on the way
 * through and change the line total.
 */
const UNIT_DECIMAL_PLACES = 4;

export type RecodeOutcome =
  | "updated"
  | "already correct"
  | "blocked"
  | "failed";

export interface RecodeResult {
  bankTransactionId: string;
  date?: string;
  reference?: string;
  total?: number;
  outcome: RecodeOutcome;
  detail: string;
}

export interface RecodeSummary {
  taxType: string;
  updated: number;
  alreadyCorrect: number;
  blocked: number;
  failed: number;
  results: RecodeResult[];
}

async function assertActiveTaxType(taxType: string): Promise<void> {
  const response = await listXeroTaxRates();

  if (response.error !== null) {
    throw new Error(
      `Could not read the organisation's tax rates to check "${taxType}": ${response.error}`,
    );
  }

  const active = response.result.filter(
    (rate) => rate.status === TaxRate.StatusEnum.ACTIVE,
  );

  if (active.some((rate) => rate.taxType === taxType)) {
    return;
  }

  const available = active
    .map((rate) => rate.taxType)
    .filter(Boolean)
    .join(", ");

  throw new Error(
    `"${taxType}" is not an active tax type in this organisation. ` +
      `Active tax types: ${available || "none returned"}`,
  );
}

async function readBankTransaction(
  bankTransactionId: string,
): Promise<BankTransaction | undefined> {
  const response = await xeroClient.accountingApi.getBankTransaction(
    xeroClient.tenantId, // xeroTenantId
    bankTransactionId, // bankTransactionID
    UNIT_DECIMAL_PLACES, // unitdp
    getClientHeaders(), // options
  );

  return response.body.bankTransactions?.[0];
}

async function writeTaxType(
  bankTransactionId: string,
  existing: BankTransaction,
  taxType: string,
): Promise<void> {
  // Send the transaction back whole with only the tax type changed. Each line
  // keeps its lineItemID, so Xero updates the existing lines instead of
  // replacing them, and the amounts and tracking stay as they were.
  const recoded: BankTransaction = {
    ...existing,
    bankTransactionID: bankTransactionId,
    lineItems: existing.lineItems?.map((line) => {
      const recodedLine = { ...line, taxType };

      // Drop the tax Xero worked out under the old rate. Sent back beside a
      // new tax type it either fails validation or holds the line at the old
      // GST, which is the one thing this tool exists to change.
      delete recodedLine.taxAmount;

      return recodedLine;
    }),
  };

  await xeroClient.accountingApi.updateBankTransaction(
    xeroClient.tenantId, // xeroTenantId
    bankTransactionId, // bankTransactionID
    { bankTransactions: [recoded] }, // bankTransactions
    UNIT_DECIMAL_PLACES, // unitdp
    undefined, // idempotencyKey
    getClientHeaders(), // options
  );
}

async function recodeOne(
  bankTransactionId: string,
  taxType: string,
): Promise<RecodeResult> {
  try {
    const transaction = await readBankTransaction(bankTransactionId);

    if (!transaction) {
      return {
        bankTransactionId,
        outcome: "failed",
        detail: "No such bank transaction in this organisation",
      };
    }

    const found = {
      bankTransactionId,
      date: transaction.date,
      reference: transaction.reference,
      total: transaction.total,
    };

    if (
      transaction.status === BankTransaction.StatusEnum.DELETED ||
      transaction.status === BankTransaction.StatusEnum.VOIDED
    ) {
      return {
        ...found,
        outcome: "blocked",
        detail: `Status is ${transaction.status}, which Xero does not allow to be edited`,
      };
    }

    if (transaction.isReconciled) {
      return {
        ...found,
        outcome: "blocked",
        detail:
          "Reconciled with a bank statement. Unreconcile it in Xero before recoding",
      };
    }

    const lineItems = transaction.lineItems ?? [];

    if (lineItems.length === 0) {
      return { ...found, outcome: "failed", detail: "No line items to recode" };
    }

    if (lineItems.every((line) => line.taxType === taxType)) {
      return {
        ...found,
        outcome: "already correct",
        detail: `Every line is already ${taxType}`,
      };
    }

    await writeTaxType(bankTransactionId, transaction, taxType);

    return {
      ...found,
      outcome: "updated",
      detail: `${lineItems.length} line ${lineItems.length === 1 ? "item" : "items"} set to ${taxType}`,
    };
  } catch (error) {
    return {
      bankTransactionId,
      outcome: "failed",
      detail: formatError(error),
    };
  }
}

/**
 * Set the tax type on every line of the named bank transactions.
 *
 * This changes the GST on each line and therefore the tax on the next BAS, so
 * the caller names each transaction rather than handing over a filter: a
 * miscoded batch is recoded deliberately, not swept up by a query. One
 * transaction failing does not stop the rest, and every outcome is reported.
 */
export async function recodeXeroBankTransactionTaxType(
  bankTransactionIds: string[],
  taxType: string,
): Promise<XeroClientResponse<RecodeSummary>> {
  try {
    const ids = [...new Set(bankTransactionIds)];

    if (ids.length === 0) {
      throw new Error("At least one bankTransactionId is required");
    }

    if (ids.length > MAX_TRANSACTIONS_PER_CALL) {
      throw new Error(
        `At most ${MAX_TRANSACTIONS_PER_CALL} transactions can be recoded in one call, received ${ids.length}. Split the batch and leave a minute between runs, so two runs together stay inside Xero's 60 calls a minute.`,
      );
    }

    await xeroClient.authenticate();
    await assertActiveTaxType(taxType);

    const results: RecodeResult[] = [];

    for (const bankTransactionId of ids) {
      results.push(await recodeOne(bankTransactionId, taxType));
    }

    const count = (outcome: RecodeOutcome): number =>
      results.filter((result) => result.outcome === outcome).length;

    return {
      result: {
        taxType,
        updated: count("updated"),
        alreadyCorrect: count("already correct"),
        blocked: count("blocked"),
        failed: count("failed"),
        results,
      },
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
