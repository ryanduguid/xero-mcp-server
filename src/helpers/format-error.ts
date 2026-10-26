import { AxiosError } from "axios";

interface XeroSdkProblem {
  title?: string;
  detail?: string;
  status?: number;
}

interface XeroValidationError {
  Message?: string;
}

interface XeroSdkErrorBody {
  httpStatusCode?: string;
  problem?: XeroSdkProblem;
  Detail?: string;
  /** Present on Xero validation exceptions, e.g. "A validation exception occurred". */
  Message?: string;
  /** Present on Xero validation exceptions, e.g. "ValidationException". */
  Type?: string;
  /** Validation failures some endpoints report at the top level. */
  ValidationErrors?: XeroValidationError[];
  /** Per-entity validation failures — where the actionable detail actually lives. */
  Elements?: Array<{ ValidationErrors?: XeroValidationError[] }>;
}

interface XeroSdkError {
  response: {
    statusCode: number;
    body?: XeroSdkErrorBody;
  };
}

function isXeroSdkError(error: unknown): error is XeroSdkError {
  if (typeof error !== "object" || error === null) return false;
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return false;
  return typeof (response as { statusCode?: unknown }).statusCode === "number";
}

/**
 * xero-node v13 issues requests through axios, which throws on any non-2xx
 * response. The generated API methods catch that and reject with
 * `JSON.stringify(new ApiError(err).generateError())` — so real SDK failures
 * reach us as a JSON *string*, not an object.
 *
 * That string embeds `response.request.headers.authorization` (the caller's
 * Bearer token), so it must never be echoed back. Parse it and let the same
 * field whitelist below decide what escapes.
 */
function parseSerialisedSdkError(error: string): unknown {
  try {
    return JSON.parse(error);
  } catch {
    return undefined;
  }
}

// Enough to show what is wrong with a batch without flooding the response.
const MAX_DETAIL_MESSAGES = 10;

/**
 * Collect the human-readable messages Xero puts in a rejected response body.
 *
 * Accounting API validation failures carry the reason in
 * `Elements[].ValidationErrors[].Message`, so reading `Detail` alone returns a
 * bare "400 BadRequest" and the model retries the same broken payload.
 *
 * Only named string fields are read. The body arrives attached to the request
 * that produced it, so stringifying it would put the caller's Bearer token
 * into a tool response.
 */
function extractDetail(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;

  const messages: string[] = [];

  const add = (value: unknown): void => {
    if (typeof value === "string" && value.trim() !== "") {
      messages.push(value.trim());
    }
  };

  const addValidationErrors = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      if (entry && typeof entry === "object") {
        add((entry as XeroValidationError).Message);
      }
    }
  };

  const { Detail, Message, ValidationErrors, Elements } =
    body as XeroSdkErrorBody;

  add(Detail);
  add(Message);
  addValidationErrors(ValidationErrors);

  if (Array.isArray(Elements)) {
    for (const element of Elements) {
      if (element && typeof element === "object") {
        addValidationErrors(
          (element as { ValidationErrors?: unknown }).ValidationErrors,
        );
      }
    }
  }

  const unique = [...new Set(messages)];
  if (unique.length === 0) return undefined;

  const shown = unique.slice(0, MAX_DETAIL_MESSAGES);
  const omitted = unique.length - shown.length;

  return omitted > 0
    ? `${shown.join("; ")} (+${omitted} more)`
    : shown.join("; ");
}

function formatHttpStatus(status: number): string {
  switch (status) {
    case 401:
      return "Authentication failed. Please check your Xero credentials.";
    case 403:
      return "You don't have permission to access this resource in Xero.";
    case 404:
      return "The requested resource was not found in Xero.";
    case 429:
      return "Too many requests to Xero. Please try again in a moment.";
    default:
      return "";
  }
}

/**
 * Format error messages for return to the LLM.
 *
 * Never stringify unknown error objects — the xero-node SDK rejects with a
 * plain object whose `request.headers.authorization` field contains the
 * caller's Bearer token. Whitelist the fields we extract so secrets never
 * reach the response.
 */
function describeSdkError(error: XeroSdkError): string {
  const status = error.response.statusCode;
  const mapped = formatHttpStatus(status);
  if (mapped) return mapped;

  const body = error.response.body;
  const problem = body?.problem;
  const title =
    problem?.title ?? body?.httpStatusCode ?? body?.Type ?? "HTTP error";

  const detail = problem?.detail ?? extractDetail(body);

  return detail ? `${status} ${title}: ${detail}` : `${status} ${title}`;
}

export function formatError(error: unknown): string {
  if (typeof error === "string") {
    const parsed = parseSerialisedSdkError(error);
    // Only a recognised, whitelisted shape may be described. Anything else
    // falls through to the generic message — never echo the raw string.
    if (isXeroSdkError(parsed)) return describeSdkError(parsed);
    return "An unexpected error occurred while communicating with Xero.";
  }

  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const detail = extractDetail(error.response?.data);

    if (status !== undefined) {
      const mapped = formatHttpStatus(status);
      if (mapped) return mapped;
    }
    return detail || "An error occurred while communicating with Xero.";
  }

  if (isXeroSdkError(error)) {
    return describeSdkError(error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while communicating with Xero.";
}
