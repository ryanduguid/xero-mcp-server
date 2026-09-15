import { xeroClient } from "../clients/xero-client.js";
import { Contact } from "xero-node";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

async function getContact(contactId: string): Promise<Contact | undefined> {
  await xeroClient.authenticate();

  const response = await xeroClient.accountingApi.getContact(
    xeroClient.tenantId, // xeroTenantId
    contactId, // contactID
    getClientHeaders(),
  );

  return response.body.contacts?.[0];
}

/**
 * Fetch one contact in full.
 *
 * list-contacts returns a summary, so the fields a review actually needs
 * (addresses, phones, payment terms and the outstanding and overdue
 * balances) only arrive when a single contact is requested.
 */
export async function getXeroContact(
  contactId: string,
): Promise<XeroClientResponse<Contact>> {
  try {
    const contact = await getContact(contactId);

    if (!contact) {
      throw new Error(`No contact found for ID ${contactId}`);
    }

    return {
      result: contact,
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
