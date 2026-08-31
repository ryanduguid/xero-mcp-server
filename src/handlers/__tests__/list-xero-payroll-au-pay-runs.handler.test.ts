import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticate, getOrganisations, getPayRuns } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getOrganisations: vi.fn(),
  getPayRuns: vi.fn(),
}));

vi.mock("../../clients/xero-client.js", () => ({
  xeroClient: {
    tenantId: "tenant-1",
    authenticate,
    accountingApi: { getOrganisations },
    payrollAUApi: { getPayRuns },
  },
}));

import { resetPayrollRegionCache } from "../../helpers/get-payroll-region.js";
import { listXeroPayrollAuPayRuns } from "../list-xero-payroll-au-pay-runs.handler.js";

describe("listXeroPayrollAuPayRuns", () => {
  beforeEach(() => {
    resetPayrollRegionCache();
    authenticate.mockReset().mockResolvedValue(undefined);
    getOrganisations.mockReset();
    getPayRuns.mockReset();
  });

  it("lists Payroll AU pay runs for Australian organisations", async () => {
    getOrganisations.mockResolvedValue({
      body: { organisations: [{ countryCode: "AU" }] },
    });
    getPayRuns.mockResolvedValue({
      body: {
        payRuns: [
          {
            payRunID: "pr-1",
            payrollCalendarID: "cal-1",
            wages: 1000,
            tax: 200,
            _super: 115,
            netPay: 800,
          },
        ],
      },
    });

    const response = await listXeroPayrollAuPayRuns();

    expect(response.isError).toBe(false);
    if (response.isError) {
      throw new Error(response.error);
    }
    expect(getPayRuns).toHaveBeenCalledOnce();
    expect(response.result?.[0]?.payRunID).toBe("pr-1");
    expect(response.result?.[0]?._super).toBe(115);
  });

  it("refuses NZ organisations", async () => {
    getOrganisations.mockResolvedValue({
      body: { organisations: [{ countryCode: "NZ" }] },
    });

    const response = await listXeroPayrollAuPayRuns();

    expect(response.isError).toBe(true);
    if (!response.isError) {
      throw new Error("expected NZ organisations to be rejected");
    }
    expect(response.error).toMatch(/Australian organisations/i);
    expect(getPayRuns).not.toHaveBeenCalled();
  });
});
