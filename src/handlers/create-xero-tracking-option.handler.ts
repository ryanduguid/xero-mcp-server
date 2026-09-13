import { createHash } from "node:crypto";
import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { TrackingOption } from "xero-node";

export interface TrackingOptionOutcome {
  name: string;
  idempotencyKey: string;
  option: TrackingOption | null;
  error: string | null;
}

export async function createXeroTrackingOptions(
  trackingCategoryId: string,
  optionNames: string[],
  idempotencyKey: string,
): Promise<XeroClientResponse<TrackingOptionOutcome[]>> {
  try {
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new Error("An operation idempotency key of 1 to 128 characters is required. Reuse it for retries.");
    }
    if (new Set(optionNames).size !== optionNames.length) {
      throw new Error("Tracking option names must be unique within the batch.");
    }
    await xeroClient.authenticate();
    const outcomes = await Promise.all(optionNames.map(async (name): Promise<TrackingOptionOutcome> => {
      // Stable for retries of the whole batch or a subset of failed names.
      const optionKey = createHash("sha256").update(JSON.stringify([
        idempotencyKey, trackingCategoryId, name,
      ])).digest("hex");
      try {
        const response = await xeroClient.accountingApi.createTrackingOptions(
          xeroClient.tenantId, trackingCategoryId, { name }, optionKey, getClientHeaders(),
        );
        const option = response.body.options?.[0];
        if (!option) throw new Error("Xero returned no tracking option.");
        return { name, idempotencyKey: optionKey, option, error: null };
      } catch (error) {
        return { name, idempotencyKey: optionKey, option: null, error: formatError(error) };
      }
    }));
    return { result: outcomes, isError: false, error: null };
  } catch (error) {
    return { result: null, isError: true, error: formatError(error) };
  }
}
