import { vi } from "vitest";

export const mockPayrollNZApi = {
  createEmployeeLeave: vi.fn(),
  updateEmployeeLeave: vi.fn(),
  deleteEmployeeLeave: vi.fn(),
  getEmployeeLeaves: vi.fn(),
};

export const mockXeroClient = {
  authenticate: vi.fn().mockResolvedValue(undefined),
  tenantId: "tenant-1",
  payrollNZApi: mockPayrollNZApi,
};

export function resetXeroClientMocks() {
  mockXeroClient.authenticate.mockClear();
  mockXeroClient.authenticate.mockResolvedValue(undefined);
  for (const fn of Object.values(mockPayrollNZApi)) {
    fn.mockReset();
  }
}
