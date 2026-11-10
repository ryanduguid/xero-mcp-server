import { beforeEach, describe, expect, it, vi } from "vitest";

// Fabricated Payroll AU data only.
const client = vi.hoisted(() => ({
  tenantId: "fixture-au-tenant",
  authenticate: vi.fn(),
  accountingApi: { getOrganisations: vi.fn() },
  payrollAUApi: { getPayItems: vi.fn(), getPayslip: vi.fn(), getPayRun: vi.fn() },
}));
vi.mock("../../clients/xero-client.js", () => ({ xeroClient: client }));

import GetPayrollPayslipTool from "../get/get-payroll-payslip.tool.js";
import ListPayrollPayItemsTool from "../list/list-payroll-pay-items.tool.js";
import ListPayrollPayslipsTool from "../list/list-payroll-payslips.tool.js";

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

describe("Payroll AU payslip text", () => {
  // A zero total is printed; a total Xero left out is not.
  const totals = {
    payslipID: "ps-2",
    employeeID: "emp-2",
    firstName: "Sam",
    wages: 1000,
    tax: 0,
    netPay: 1000,
  };
  const summary = "Payslip ID: ps-2\nEmployee ID: emp-2\nName: Sam\nWages: 1000\nTax: 0\nNet Pay: 1000";

  it("lists each payslip's IDs, name and totals", async () => {
    client.payrollAUApi.getPayRun.mockResolvedValue({
      body: { payRuns: [{ payRunID: "pr-1", payslips: [totals] }] },
    });

    const listed = text(
      await ListPayrollPayslipsTool().handler({ payRunID: "pr-1" }, {} as never),
    );

    expect(listed).toBe(`Found 1 payslips on pay run pr-1:\n${summary}`);
  });

  it("prints the same summary ahead of one payslip's lines", async () => {
    client.payrollAUApi.getPayslip.mockResolvedValue({ body: { payslip: totals } });

    const payslip = text(
      await GetPayrollPayslipTool().handler({ payslipID: "ps-2" }, {} as never),
    );

    expect(payslip).toBe(
      `${summary}\nEarnings lines:\n  None\nSuperannuation lines:\n  None`,
    );
  });
});
