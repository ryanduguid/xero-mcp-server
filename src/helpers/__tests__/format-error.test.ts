import { describe, it, expect } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { formatError } from "../format-error.js";

function makeAxiosError(status: number, detail?: string): AxiosError {
  const headers = new AxiosHeaders();
  const config = { headers };
  const err = new AxiosError(
    "Request failed",
    String(status),
    config as never,
    null,
    {
      status,
      data: detail ? { Detail: detail } : {},
      statusText: "",
      headers: {},
      config,
    } as never,
  );
  return err;
}

describe("formatError", () => {
  describe("AxiosError mapping", () => {
    it("maps 401 to authentication message", () => {
      expect(formatError(makeAxiosError(401))).toBe(
        "Authentication failed. Please check your Xero credentials.",
      );
    });

    it("maps 403 to permission message", () => {
      expect(formatError(makeAxiosError(403))).toBe(
        "You don't have permission to access this resource in Xero.",
      );
    });

    it("maps 404 to not-found message", () => {
      expect(formatError(makeAxiosError(404))).toBe(
        "The requested resource was not found in Xero.",
      );
    });

    it("maps 429 to rate-limit message", () => {
      expect(formatError(makeAxiosError(429))).toBe(
        "Too many requests to Xero. Please try again in a moment.",
      );
    });

    it("returns response.data.Detail for non-mapped statuses", () => {
      expect(formatError(makeAxiosError(400, "Field is required"))).toBe(
        "Field is required",
      );
    });

    it("returns generic message when no Detail is provided", () => {
      expect(formatError(makeAxiosError(500))).toBe(
        "An error occurred while communicating with Xero.",
      );
    });
  });

  describe("xero-node SDK error shape", () => {
    it("extracts problem.detail and title without leaking request headers", () => {
      const sdkError = {
        response: {
          statusCode: 405,
          body: {
            httpStatusCode: "MethodNotAllowed",
            problem: {
              title: "MethodNotAllowed",
              detail: "Method not allowed for the current customer jurisdiction.",
              status: 405,
            },
          },
          headers: { "set-cookie": "ak_bmsc=secret" },
        },
        request: {
          headers: { authorization: "Bearer eyJSECRET" },
        },
      };

      const result = formatError(sdkError);

      expect(result).toBe(
        "405 MethodNotAllowed: Method not allowed for the current customer jurisdiction.",
      );
      expect(result).not.toContain("Bearer");
      expect(result).not.toContain("eyJSECRET");
      expect(result).not.toContain("set-cookie");
    });

    it("maps 401 SDK error to the standard auth message", () => {
      const sdkError = {
        response: { statusCode: 401, body: {} },
        request: { headers: { authorization: "Bearer leaky" } },
      };

      const result = formatError(sdkError);
      expect(result).toBe(
        "Authentication failed. Please check your Xero credentials.",
      );
      expect(result).not.toContain("Bearer");
    });

    it("falls back to status code + title when detail is missing", () => {
      const sdkError = {
        response: {
          statusCode: 502,
          body: { httpStatusCode: "BadGateway" },
        },
      };

      expect(formatError(sdkError)).toBe("502 BadGateway");
    });

    it("falls back to a generic title when neither problem nor httpStatusCode is present", () => {
      const sdkError = { response: { statusCode: 502 } };
      expect(formatError(sdkError)).toBe("502 HTTP error");
    });
  });

  describe("plain Error", () => {
    it("returns the error message", () => {
      expect(formatError(new Error("Employee ID is required"))).toBe(
        "Employee ID is required",
      );
    });
  });

  describe("unknown error shapes", () => {
    it("returns a generic message and never stringifies the object", () => {
      const leakyUnknown = {
        request: { headers: { authorization: "Bearer LEAKY_TOKEN" } },
      };

      const result = formatError(leakyUnknown);

      expect(result).toBe(
        "An unexpected error occurred while communicating with Xero.",
      );
      expect(result).not.toContain("Bearer");
      expect(result).not.toContain("LEAKY_TOKEN");
    });

    it("handles string errors safely", () => {
      expect(formatError("something blew up")).toBe(
        "An unexpected error occurred while communicating with Xero.",
      );
    });

    it("handles null safely", () => {
      expect(formatError(null)).toBe(
        "An unexpected error occurred while communicating with Xero.",
      );
    });
  });

  describe("Xero validation errors", () => {
    function makeAxiosErrorWithBody(status: number, data: unknown): AxiosError {
      const headers = new AxiosHeaders();
      const config = { headers };
      return new AxiosError(
        "Request failed",
        String(status),
        config as never,
        null,
        {
          status,
          data,
          statusText: "",
          headers: {},
          config,
        } as never,
      );
    }

    it("reports the validation messages nested under Elements", () => {
      const error = makeAxiosErrorWithBody(400, {
        Message: "A validation exception occurred",
        Elements: [
          {
            ValidationErrors: [
              { Message: "Account code 'ZZZ' is not a valid code" },
              { Message: "Tax type must be specified" },
            ],
          },
        ],
      });

      expect(formatError(error)).toBe(
        "A validation exception occurred; Account code 'ZZZ' is not a valid code; Tax type must be specified",
      );
    });

    it("reports validation messages on the SDK error shape", () => {
      const sdkError = {
        response: {
          statusCode: 400,
          body: {
            httpStatusCode: "BadRequest",
            Elements: [
              {
                ValidationErrors: [
                  { Message: "Invoice not of valid status for modification" },
                ],
              },
            ],
          },
        },
      };

      expect(formatError(sdkError)).toBe(
        "400 BadRequest: Invoice not of valid status for modification",
      );
    });

    it("reads validation errors reported at the top level", () => {
      const error = makeAxiosErrorWithBody(400, {
        ValidationErrors: [{ Message: "Date is not a valid date" }],
      });

      expect(formatError(error)).toBe("Date is not a valid date");
    });

    it("reports each distinct message once", () => {
      const error = makeAxiosErrorWithBody(400, {
        Detail: "Line amount does not balance",
        Message: "Line amount does not balance",
        Elements: [
          {
            ValidationErrors: [{ Message: "Line amount does not balance" }],
          },
        ],
      });

      expect(formatError(error)).toBe("Line amount does not balance");
    });

    it("caps a long list and says how many are left", () => {
      const error = makeAxiosErrorWithBody(400, {
        Elements: Array.from({ length: 12 }, (_unused, index) => ({
          ValidationErrors: [{ Message: `Problem ${index}` }],
        })),
      });

      const result = formatError(error);

      expect(result).toContain("Problem 9");
      expect(result).not.toContain("Problem 10");
      expect(result).toContain("(+2 more)");
    });

    it("never reads unnamed fields, so a token in the body cannot escape", () => {
      const error = makeAxiosErrorWithBody(400, {
        Detail: "Contact name is required",
        request: { headers: { authorization: "Bearer LEAKY_TOKEN" } },
      });

      const result = formatError(error);

      expect(result).toBe("Contact name is required");
      expect(result).not.toContain("Bearer");
      expect(result).not.toContain("LEAKY_TOKEN");
    });

    it("falls back to the generic message when the body is malformed", () => {
      const error = makeAxiosErrorWithBody(400, {
        Elements: "not an array",
        ValidationErrors: 42,
      });

      expect(formatError(error)).toBe(
        "An error occurred while communicating with Xero.",
      );
    });
  });
});
