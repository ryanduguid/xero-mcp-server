import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { CreditNote } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { toGuidFilter } from "../helpers/xero-guid.js";

async function getCreditNotes(
  contactId: string | undefined,
  page: number,
): Promise<CreditNote[]> {
  // A supplied contact ID is checked even when it is empty, so an empty
  // value cannot fall through to a listing of every credit note.
  const where =
    contactId !== undefined
      ? `Contact.ContactID=${toGuidFilter("contactId", contactId)}`
      : undefined;

  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.getCreditNotes(
    xeroClient.tenantId,
    undefined, // ifModifiedSince
    where, // where
    "UpdatedDateUTC DESC", // order
    page, // page
    undefined, // unitdp
    10, // pageSize
    getClientHeaders(),
  );

  return response.body.creditNotes ?? [];
}

/**
 * List all credit notes from Xero
 */
export async function listXeroCreditNotes(
  page: number = 1,
  contactId?: string,
): Promise<XeroClientResponse<CreditNote[]>> {
  try {
    const creditNotes = await getCreditNotes(contactId, page);

    return {
      result: creditNotes,
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
