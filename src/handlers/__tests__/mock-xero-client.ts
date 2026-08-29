import { vi } from "vitest";

export const mockAccountingApi = {
  createPurchaseOrders: vi.fn(),
  getPurchaseOrders: vi.fn(),
  getPurchaseOrder: vi.fn(),
  getPurchaseOrderByNumber: vi.fn(),
  updatePurchaseOrder: vi.fn(),
};

export const mockXeroClient = {
  authenticate: vi.fn().mockResolvedValue(undefined),
  tenantId: "tenant-1",
  accountingApi: mockAccountingApi,
  getShortCode: vi.fn().mockResolvedValue("!abc"),
};

export function resetXeroClientMocks() {
  mockXeroClient.authenticate.mockClear();
  mockXeroClient.getShortCode.mockClear();
  mockXeroClient.getShortCode.mockResolvedValue("!abc");
  mockXeroClient.authenticate.mockResolvedValue(undefined);
  for (const fn of Object.values(mockAccountingApi)) {
    fn.mockReset();
  }
}
