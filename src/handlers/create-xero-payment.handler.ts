import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { Payment } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { todayIsoDate } from "../helpers/xero-date.js";

type PaymentProps = {
  idempotencyKey: string;
  invoiceId: string;
  accountId: string;
  amount: number;
  date?: string;
  reference?: string;
};

async function createPayment({
  idempotencyKey,
  invoiceId,
  accountId,
  amount,
  date,
  reference,
}: PaymentProps): Promise<Payment | undefined> {
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw new Error("An operation idempotency key of 1 to 128 characters is required. Reuse it for retries.");
  }
  await xeroClient.authenticate();

  const payment: Payment = {
    invoice: {
      invoiceID: invoiceId,
    },
    account: {
      accountID: accountId,
    },
    amount: amount,
    date: date || todayIsoDate(),
    reference: reference,
  };

  const response = await xeroClient.accountingApi.createPayment(
    xeroClient.tenantId,
    payment,
    idempotencyKey,
    getClientHeaders(), // options
  );

  return response.body.payments?.[0];
}

/**
 * Create a new payment in Xero
 */
export async function createXeroPayment({
  idempotencyKey,
  invoiceId,
  accountId,
  amount,
  date,
  reference,
}: PaymentProps): Promise<XeroClientResponse<Payment>> {
  try {
    const createdPayment = await createPayment({
      idempotencyKey,
  invoiceId,
      accountId,
      amount,
      date,
      reference,
    });

    if (!createdPayment) {
      throw new Error("Payment creation failed.");
    }

    return {
      result: createdPayment,
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
