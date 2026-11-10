import { CountryCode } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { getClientHeaders } from "./get-client-headers.js";

// Organisations already confirmed as Australian. A country does not change, so
// one lookup per organisation is enough. A refusal is not remembered.
const australianTenants = new Set<string>();

/**
 * Payroll AU answers only for Australian organisations. Check first so a New
 * Zealand or UK organisation gets a plain refusal instead of a Xero API error.
 */
export async function assertAustralianPayroll(toolName: string): Promise<void> {
  await xeroClient.authenticate();
  const tenantId = xeroClient.tenantId;
  if (australianTenants.has(tenantId)) return;

  const response = await xeroClient.accountingApi.getOrganisations(
    tenantId,
    getClientHeaders(),
  );
  const countryCode = response.body.organisations?.[0]?.countryCode;
  if (!countryCode) {
    throw new Error(
      `${toolName} could not read the organisation's country from Xero, so it cannot confirm the organisation uses Payroll AU.`,
    );
  }
  if (countryCode !== CountryCode.AU) {
    throw new Error(
      `${toolName} uses Xero Payroll AU, so it works only for Australian organisations.`,
    );
  }
  australianTenants.add(tenantId);
}
