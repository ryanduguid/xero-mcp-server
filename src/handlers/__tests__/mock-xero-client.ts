import { vi } from "vitest";

export const mockAccountingApi = {
  getReportBankSummary: vi.fn(),
  getReportBudgetSummary: vi.fn(),
  getReportExecutiveSummary: vi.fn(),
};

export const mockXeroClient = {
  authenticate: vi.fn().mockResolvedValue(undefined),
  tenantId: "tenant-1",
  accountingApi: mockAccountingApi,
};

export function resetXeroClientMocks() {
  mockXeroClient.authenticate.mockClear();
  mockXeroClient.authenticate.mockResolvedValue(undefined);
  for (const fn of Object.values(mockAccountingApi)) {
    fn.mockReset();
  }
}
