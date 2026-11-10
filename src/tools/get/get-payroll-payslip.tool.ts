import { z } from "zod";

import { getXeroPayrollAuPayslip } from "../../handlers/get-xero-payroll-au-payslip.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatPayslipSummary } from "../../helpers/format-payslip-summary.js";

const GetPayrollPayslipTool = CreateXeroTool(
  "get-payroll-payslip",
  `Retrieve one Australian Payroll AU payslip by ID, including earnings lines and superannuation lines (membership, contribution type, amount, payment date). Australian organisations only. Needs the payroll.payslip.read scope, which is not in the default scope lists. This tool only reads data.`,
  {
    payslipID: z.string().describe("The Payroll AU payslip ID to retrieve."),
  },
  async ({ payslipID }: { payslipID: string }) => {
    const response = await getXeroPayrollAuPayslip(payslipID);

    if (response.isError) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error retrieving payslip: ${response.error}`,
          },
        ],
      };
    }

    const payslip = response.result;

    if (!payslip) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No payslip found with ID: ${payslipID}`,
          },
        ],
      };
    }

    const superLines =
      payslip.superannuationLines
        ?.map((line) =>
          [
            `  Super membership: ${line.superMembershipID ?? "unknown"}`,
            line.contributionType
              ? `  Contribution type: ${String(line.contributionType)}`
              : null,
            line.percentage !== undefined
              ? `  Percentage: ${line.percentage}`
              : null,
            line.amount !== undefined ? `  Amount: ${line.amount}` : null,
            line.paymentDateForThisPeriod
              ? `  Payment date: ${line.paymentDateForThisPeriod}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n") || "  None";

    const earningsLines =
      payslip.earningsLines
        ?.map((line) =>
          [
            `  Earnings rate: ${line.earningsRateID}`,
            line.amount !== undefined ? `  Amount: ${line.amount}` : null,
            line.numberOfUnits !== undefined
              ? `  Units: ${line.numberOfUnits}`
              : null,
            line.ratePerUnit !== undefined
              ? `  Rate per unit: ${line.ratePerUnit}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n") || "  None";

    return {
      content: [
        {
          type: "text" as const,
          text: [
            ...formatPayslipSummary(payslip),
            "Earnings lines:",
            earningsLines,
            "Superannuation lines:",
            superLines,
          ].join("\n"),
        },
      ],
    };
  },
);

export default GetPayrollPayslipTool;
