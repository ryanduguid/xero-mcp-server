import { z } from "zod";

import { listXeroPayrollAuPayslips } from "../../handlers/list-xero-payroll-au-payslips.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatPayslipSummary } from "../../helpers/format-payslip-summary.js";
import { AuPayslipSummary } from "../../types/payroll-au-types.js";

const ListPayrollPayslipsTool = CreateXeroTool(
  "list-payroll-payslips",
  `List payslip summaries on an Australian Payroll AU pay run.
Shows wages, tax, super and net pay per employee. Use get-payroll-payslip for earnings and superannuation lines. Australian organisations only. Needs the payroll.payruns.read scope, which is not in the default scope lists. This tool only reads data.`,
  {
    payRunID: z
      .string()
      .describe("The Payroll AU pay run ID whose payslips should be listed."),
  },
  async ({ payRunID }: { payRunID: string }) => {
    const response = await listXeroPayrollAuPayslips(payRunID);

    if (response.isError) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error listing payslips: ${response.error}`,
          },
        ],
      };
    }

    const payslips = response.result;

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${payslips?.length || 0} payslips on pay run ${payRunID}:`,
        },
        ...(payslips?.map((payslip: AuPayslipSummary) => ({
          type: "text" as const,
          text: formatPayslipSummary(payslip).join("\n"),
        })) || []),
      ],
    };
  },
);

export default ListPayrollPayslipsTool;
