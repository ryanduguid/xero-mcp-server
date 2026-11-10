import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { Payment } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { toGuidFilter } from "../helpers/xero-guid.js";

/**
 * Render a value as the string literal a where clause expects.
 *
 * A double quote would close the literal and let the rest of the value add
 * conditions of its own. Values with a quote or backslash are refused rather
 * than escaped, because how Xero's parser reads an escaped quote is unconfirmed.
 */
function toStringFilter(field: string, value: string): string {
  if (value === "" || /["\\]/.test(value)) {
    throw new Error(
      `${field} cannot contain a double quote or backslash and cannot be empty, received "${value}"`,
    );
  }

  return `"${value}"`;
}

async function getPayments(
  page: number = 1,
  {
    invoiceNumber,
    invoiceId,
    paymentId,
    reference,
  }: {
    invoiceNumber?: string;
    invoiceId?: string;
    paymentId?: string;
    reference?: string;
  },
): Promise<Payment[]> {
  // Build where clause for filtering. Every filter is checked when it is
  // supplied, empty string included, so an empty value cannot fall through to
  // a listing of every payment.
  const whereConditions: string[] = [];

  if (invoiceId !== undefined) {
    whereConditions.push(
      `Invoice.InvoiceID==${toGuidFilter("invoiceId", invoiceId)}`,
    );
  }
  if (invoiceNumber !== undefined) {
    whereConditions.push(
      `Invoice.InvoiceNumber==${toStringFilter("invoiceNumber", invoiceNumber)}`,
    );
  }
  if (paymentId !== undefined) {
    whereConditions.push(`PaymentID==${toGuidFilter("paymentId", paymentId)}`);
  }
  if (reference !== undefined) {
    whereConditions.push(`Reference==${toStringFilter("reference", reference)}`);
  }

  // Combine conditions
  const where =
    whereConditions.length > 0 ? whereConditions.join(" AND ") : undefined;

  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.getPayments(
    xeroClient.tenantId,
    undefined, // ifModifiedSince
    where,
    "UpdatedDateUTC DESC", // order
    page, // page
    10, // pageSize
    getClientHeaders(), // options
  );

  return response.body.payments ?? [];
}

/**
 * List payments from Xero
 */
export async function listXeroPayments(
  page: number = 1,
  {
    invoiceNumber,
    invoiceId,
    paymentId,
    reference,
  }: {
    invoiceNumber?: string;
    invoiceId?: string;
    paymentId?: string;
    reference?: string;
  },
): Promise<XeroClientResponse<Payment[]>> {
  try {
    const payments = await getPayments(page, {
      invoiceNumber,
      invoiceId,
      paymentId,
      reference,
    });

    return {
      result: payments,
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
