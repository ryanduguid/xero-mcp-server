import { CountryCode } from "xero-node";

import { xeroClient } from "../clients/xero-client.js";
import { getClientHeaders } from "./get-client-headers.js";

export type PayrollRegion = "AU" | "NZ" | "UK" | "OTHER";

const cache = new Map<string, PayrollRegion>();

export function resetPayrollRegionCache(): void {
  cache.clear();
}

export function toPayrollRegion(code: unknown): PayrollRegion {
  const value = String(code ?? "");
  if (value === "AU" || code === CountryCode.AU) {
    return "AU";
  }
  if (value === "NZ" || code === CountryCode.NZ) {
    return "NZ";
  }
  if (value === "GB" || value === "UK" || code === CountryCode.GB) {
    return "UK";
  }
  return "OTHER";
}

export async function getPayrollRegion(): Promise<PayrollRegion> {
  await xeroClient.authenticate();
  const tenantId = xeroClient.tenantId || "";
  const cached = cache.get(tenantId);
  if (cached) {
    return cached;
  }

  const response = await xeroClient.accountingApi.getOrganisations(
    tenantId,
    getClientHeaders(),
  );
  const code = response.body.organisations?.[0]?.countryCode;
  const region = toPayrollRegion(code);
  cache.set(tenantId, region);
  return region;
}

export async function assertAustralianPayroll(toolName: string): Promise<void> {
  const region = await getPayrollRegion();
  if (region !== "AU") {
    throw new Error(
      `${toolName} reads Xero Payroll AU. It is only available for Australian organisations.`,
    );
  }
}
