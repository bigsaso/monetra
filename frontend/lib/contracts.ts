export type MonthlyExpenseGroupBreakdown = {
  month: string;
  income_total: number | string;
  needs_total: number | string;
  wants_total: number | string;
  investments_total: number | string;
  projected_total_income?: number | string;
  projected_total_expenses?: number | string;
};

export type MonthlyExpenseGroupsState = {
  data: MonthlyExpenseGroupBreakdown | null;
  loading: boolean;
  error: string;
};

export type MonthlyExpenseGroupsParams = {
  month?: string;
};
