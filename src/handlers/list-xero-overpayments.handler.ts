import { xeroClient } from "../clients/xero-client.js";
import { Overpayment } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { toGuidFilter } from "../helpers/xero-guid.js";

async function getOverpayments(
  page: number,
  contactId?: string,
): Promise<Overpayment[]> {
  // A supplied contact ID is checked even when it is empty, so an empty
  // value cannot fall through to a listing of every overpayment.
  const where =
    contactId !== undefined
      ? `Contact.ContactID==${toGuidFilter("contactId", contactId)}`
      : undefined;

  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.getOverpayments(
    xeroClient.tenantId, // xeroTenantId
    undefined, // ifModifiedSince
    where, // where
    "Date DESC", // order
    page, // page
    undefined, // unitdp
    10, // pageSize
    getClientHeaders(),
  );

  return response.body.overpayments ?? [];
}

/**
 * List overpayments, which are the balance left when a contact pays more than
 * the invoice or bill was for. The excess stays as credit against the contact
 * until it is allocated or refunded.
 */
export async function listXeroOverpayments(
  page: number = 1,
  contactId?: string,
): Promise<XeroClientResponse<Overpayment[]>> {
  try {
    const overpayments = await getOverpayments(page, contactId);

    return {
      result: overpayments,
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
