import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  tenantId: "",
  authenticate: vi.fn(),
  accountingApi: { getOrganisations: vi.fn() },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import { assertAustralianPayroll } from "../assert-australian-payroll.js";

const organisationIn = (countryCode?: string) =>
  client.accountingApi.getOrganisations.mockResolvedValue({
    body: { organisations: countryCode ? [{ countryCode }] : [] },
  });

beforeEach(() => {
  vi.resetAllMocks();
  client.tenantId = randomUUID();
  client.authenticate.mockResolvedValue(undefined);
});

describe("assertAustralianPayroll", () => {
  it("lets an Australian organisation through and looks it up once", async () => {
    organisationIn("AU");

    await assertAustralianPayroll("list-payroll-pay-runs");
    await assertAustralianPayroll("list-payroll-pay-runs");

    expect(client.accountingApi.getOrganisations).toHaveBeenCalledOnce();
    expect(client.accountingApi.getOrganisations).toHaveBeenCalledWith(
      client.tenantId,
      expect.any(Object),
    );
  });

  it.each(["NZ", "GB", undefined])(
    "refuses an organisation in %s with a message, not an API error",
    async (countryCode) => {
      organisationIn(countryCode);

      await expect(assertAustralianPayroll("get-payroll-payslip")).rejects.toThrow(
        "get-payroll-payslip uses Xero Payroll AU, so it works only for Australian organisations.",
      );
    },
  );

  it("asks again after a refusal", async () => {
    organisationIn("NZ");
    await expect(assertAustralianPayroll("list-payroll-pay-runs")).rejects.toThrow();
    await expect(assertAustralianPayroll("list-payroll-pay-runs")).rejects.toThrow();

    expect(client.accountingApi.getOrganisations).toHaveBeenCalledTimes(2);
  });

  it("checks each organisation separately", async () => {
    organisationIn("AU");
    await assertAustralianPayroll("list-payroll-pay-runs");

    client.tenantId = randomUUID();
    organisationIn("NZ");

    await expect(assertAustralianPayroll("list-payroll-pay-runs")).rejects.toThrow(
      /Australian organisations/,
    );
  });

  it("passes on an authentication refusal without looking anything up", async () => {
    client.authenticate.mockRejectedValue(
      new Error("This connection reaches more than one Xero organisation."),
    );

    await expect(assertAustralianPayroll("list-payroll-pay-runs")).rejects.toThrow(
      "more than one Xero organisation",
    );
    expect(client.accountingApi.getOrganisations).not.toHaveBeenCalled();
  });
});
