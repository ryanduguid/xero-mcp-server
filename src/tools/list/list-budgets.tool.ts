import { listXeroBudgets } from "../../handlers/list-xero-budgets.handler.js";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";

export default CreateXeroTool(
  "list-budgets",
  "List Xero budgets and their IDs. Use get-budget to retrieve account-by-period budget amounts. Needs the accounting.budgets.read scope, which is not in the default scope lists. This tool only reads data.",
  {},
  async () => {
    const response = await listXeroBudgets();
    return {
      isError: response.isError,
      content: [
        {
          type: "text" as const,
          text:
            response.error !== null
              ? `Error listing budgets: ${response.error}`
              : JSON.stringify(response.result, null, 2),
        },
      ],
    };
  },
);
