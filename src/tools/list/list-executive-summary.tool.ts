import { z } from "zod";

import { listXeroExecutiveSummary } from "../../handlers/list-xero-executive-summary.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatReportContent } from "../../helpers/format-report.js";

const ListExecutiveSummaryTool = CreateXeroTool(
  "list-executive-summary",
  `List the Executive Summary report from Xero. A one-page snapshot of cash, profit and loss, and balance-sheet highlights as at a date.
Needs accounting.reports.read, which the older default scope list grants, or accounting.reports.executivesummary.read, which the granular default list does not. This tool only reads data.`,
  {
    date: z
      .string()
      .date()
      .optional()
      .describe("Optional as-at date in YYYY-MM-DD format"),
  },
  async ({ date }) => {
    const response = await listXeroExecutiveSummary({ date });

    if (response.error !== null) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error listing executive summary: ${response.error}`,
          },
        ],
      };
    }

    return {
      content: formatReportContent("Executive Summary Report", response.result),
    };
  },
);

export default ListExecutiveSummaryTool;
