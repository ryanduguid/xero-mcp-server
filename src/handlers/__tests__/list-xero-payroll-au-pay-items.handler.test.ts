import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticate, getOrganisations, getPayItems } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getOrganisations: vi.fn(),
  getPayItems: vi.fn(),
}));

const xeroClient = vi.hoisted(() => ({ tenantId: "" }));

vi.mock("../../clients/xero-client.js", () => ({
  xeroClient: Object.assign(xeroClient, {
    authenticate,
    accountingApi: { getOrganisations },
    payrollAUApi: { getPayItems },
  }),
}));

import { listXeroPayrollAuPayItems } from "../list-xero-payroll-au-pay-items.handler.js";

describe("listXeroPayrollAuPayItems", () => {
  beforeEach(() => {
    xeroClient.tenantId = randomUUID();
    authenticate.mockReset().mockResolvedValue(undefined);
    getOrganisations.mockReset();
    getPayItems.mockReset();
  });

  it("returns earnings rates including super exemption flags", async () => {
    getOrganisations.mockResolvedValue({
      body: { organisations: [{ countryCode: "AU" }] },
    });
    getPayItems.mockResolvedValue({
      body: {
        payItems: {
          earningsRates: [
            {
              earningsRateID: "er-ord",
              name: "Ordinary Hours",
              isExemptFromSuper: false,
              isReportableAsW1: true,
            },
          ],
          deductionTypes: [],
          leaveTypes: [],
          reimbursementTypes: [],
        },
      },
    });

    const response = await listXeroPayrollAuPayItems();

    expect(response.isError).toBe(false);
    if (response.isError) {
      throw new Error(response.error);
    }
    expect(response.result?.earningsRates?.[0]).toEqual(
      expect.objectContaining({
        name: "Ordinary Hours",
        isExemptFromSuper: false,
        isReportableAsW1: true,
      }),
    );
  });
});
