import { AuPayslipSummary } from "../types/payroll-au-types.js";

type PayslipTotals = Pick<
  AuPayslipSummary,
  | "payslipID"
  | "employeeID"
  | "firstName"
  | "lastName"
  | "wages"
  | "tax"
  | "_super"
  | "netPay"
>;

/** The lines both payslip tools print first: the IDs, the name and the totals Xero returned. */
export const formatPayslipSummary = (payslip: PayslipTotals): string[] => {
  const name = [payslip.firstName, payslip.lastName].filter(Boolean).join(" ");
  return [
    `Payslip ID: ${payslip.payslipID}`,
    `Employee ID: ${payslip.employeeID}`,
    name ? `Name: ${name}` : null,
    payslip.wages !== undefined ? `Wages: ${payslip.wages}` : null,
    payslip.tax !== undefined ? `Tax: ${payslip.tax}` : null,
    payslip._super !== undefined ? `Super: ${payslip._super}` : null,
    payslip.netPay !== undefined ? `Net Pay: ${payslip.netPay}` : null,
  ].filter((line): line is string => line !== null);
};
