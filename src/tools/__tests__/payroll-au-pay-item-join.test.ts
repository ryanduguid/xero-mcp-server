import { beforeEach, describe, expect, it, vi } from "vitest";

// Fabricated Payroll AU data only.
const client = vi.hoisted(() => ({
  tenantId: "fixture-au-tenant",
  authenticate: vi.fn(),
  accountingApi: { getOrganisations: vi.fn() },
  payrollAUApi: { getPayItems: vi.fn(), getPayslip: vi.fn() },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import GetPayrollPayslipTool from "../get/get-payroll-payslip.tool.js";
import ListPayrollPayItemsTool from "../list/list-payroll-pay-items.tool.js";

const text = (result: { content: { type: string; text?: string }[] }) =>
  result.content.map((block) => block.text ?? "").join("\n");

beforeEach(() => {
  vi.resetAllMocks();
  client.authenticate.mockResolvedValue(undefined);
  client.accountingApi.getOrganisations.mockResolvedValue({
    body: { organisations: [{ countryCode: "AU" }] },
  });
  client.payrollAUApi.getPayItems.mockResolvedValue({
    body: {
      payItems: {
        earningsRates: [
          { earningsRateID: "er-ord", name: "Ordinary Hours", isExemptFromSuper: false },
          { earningsRateID: "er-allow", name: "Tool Allowance", isExemptFromSuper: true },
        ],
        deductionTypes: [{ deductionTypeID: "dt-union", name: "Union Fees" }],
        leaveTypes: [{ leaveTypeID: "lt-annual", name: "Annual Leave" }],
        reimbursementTypes: [{ reimbursementTypeID: "rt-travel", name: "Travel" }],
      },
    },
  });
  client.payrollAUApi.getPayslip.mockResolvedValue({
    body: {
      payslip: {
        payslipID: "ps-1",
        employeeID: "emp-1",
        earningsLines: [{ earningsRateID: "er-allow", amount: 50 }],
      },
    },
  });
});

describe("Payroll AU pay items", () => {
  it("let a payslip's earnings line be joined to its rate and super flag", async () => {
    const payslip = text(
      await GetPayrollPayslipTool().handler({ payslipID: "ps-1" }, {} as never),
    );
    const payItems = text(await ListPayrollPayItemsTool().handler({}, {} as never));

    const rateId = /Earnings rate: (\S+)/.exec(payslip)?.[1];
    expect(rateId).toBe("er-allow");
    const rateLine = payItems.split("\n").find((line) => line.includes(`(ID ${rateId})`));
    expect(rateLine).toContain("Tool Allowance");
    expect(rateLine).toContain("exemptFromSuper=true");
  });

  it("names every pay item with its ID", async () => {
    const payItems = text(await ListPayrollPayItemsTool().handler({}, {} as never));

    for (const expected of [
      "Ordinary Hours (ID er-ord)",
      "Union Fees (ID dt-union)",
      "Annual Leave (ID lt-annual)",
      "Travel (ID rt-travel)",
    ]) {
      expect(payItems).toContain(expected);
    }
  });
});
