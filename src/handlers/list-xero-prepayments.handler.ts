import { xeroClient } from "../clients/xero-client.js";
import { Prepayment } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { toGuidFilter } from "../helpers/xero-guid.js";

async function getPrepayments(
  page: number,
  contactId?: string,
): Promise<Prepayment[]> {
  const where = contactId
    ? `Contact.ContactID==${toGuidFilter("contactId", contactId)}`
    : undefined;

  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.getPrepayments(
    xeroClient.tenantId, // xeroTenantId
    undefined, // ifModifiedSince
    where, // where
    "Date DESC", // order
    page, // page
    undefined, // unitdp
    10, // pageSize
    getClientHeaders(),
  );

  return response.body.prepayments ?? [];
}

/**
 * List prepayments, which are payments banked before there is an invoice or
 * bill to apply them to. The credit sits against the contact until it is
 * allocated, so an unallocated prepayment is a common month-end exception.
 */
export async function listXeroPrepayments(
  page: number = 1,
  contactId?: string,
): Promise<XeroClientResponse<Prepayment[]>> {
  try {
    const prepayments = await getPrepayments(page, contactId);

    return {
      result: prepayments,
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
