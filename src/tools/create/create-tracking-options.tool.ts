import { z } from "zod";
import { CreateXeroTool } from "../../helpers/create-xero-tool.js";
import { formatTrackingOption } from "../../helpers/format-tracking-option.js";
import { createXeroTrackingOptions } from "../../handlers/create-xero-tracking-option.handler.js";

const CreateTrackingOptionsTool = CreateXeroTool(
  "create-tracking-options",
  `Create tracking options for a tracking category in Xero.`,
  {
    trackingCategoryId: z.string(),
    optionNames: z.array(z.string().min(1)).min(1).max(10),
    idempotencyKey: z.string().min(1).max(128).describe("A unique batch operation key. Reuse this key and the exact option names when retrying the batch or its failed options.")
  },
  async ({ trackingCategoryId, optionNames, idempotencyKey }) => {
    const response = await createXeroTrackingOptions(trackingCategoryId, optionNames, idempotencyKey);

    if (response.isError) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Error while creating tracking options: ${response.error}`
          }
        ]
      };
    }

    const outcomes = response.result;
    const succeeded = outcomes.filter(outcome => outcome.option !== null).length;
    
    return {
      isError: outcomes.some(outcome => outcome.error !== null),
      content: [
        {
          type: "text" as const,
          text: [
            `${succeeded} out of ${optionNames.length} tracking options created.`,
            `Batch operation key: ${idempotencyKey}. Reuse it for retries with the same option names.`,
            ...outcomes.map(outcome => outcome.option
              ? `Created: ${formatTrackingOption(outcome.option)}\nOption key: ${outcome.idempotencyKey}`
              : `Failed: ${outcome.name}\nOption key: ${outcome.idempotencyKey}\nError: ${outcome.error}`),
          ].join("\n")
        },
      ]
    };
  }
);

export default CreateTrackingOptionsTool;