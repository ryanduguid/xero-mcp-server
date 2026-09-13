import { xeroClient } from "../clients/xero-client.js";
import { XeroClientResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";
import { getClientHeaders } from "../helpers/get-client-headers.js";
import { Employee } from "../types/payroll-nz-types.js";

// Xero returns payroll employees in sets of 100. Stop after a generous number
// of pages so a bad pagination header cannot spin forever.
const MAX_PAGES = 100;

async function getPayrollEmployees(): Promise<Employee[]> {
  await xeroClient.authenticate();

  const collected: Employee[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const response = await xeroClient.payrollNZApi.getEmployees(
      xeroClient.tenantId,
      undefined, // filter
      page,
      getClientHeaders(),
    );

    const employees = response.body.employees ?? [];
    collected.push(...employees);

    const reportedPageCount = response.body.pagination?.pageCount;
    pageCount = typeof reportedPageCount === "number" ? reportedPageCount : page;

    if (employees.length === 0) break;
    page += 1;
  } while (page <= pageCount && page <= MAX_PAGES);

  return collected;
}

/**
 * List all payroll employees from Xero, following pagination to the last page.
 */
export async function listXeroPayrollEmployees(): Promise<
  XeroClientResponse<Employee[]>
> {
  try {
    const employees = await getPayrollEmployees();

    return {
      result: employees,
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
