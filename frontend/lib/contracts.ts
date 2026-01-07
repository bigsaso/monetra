export type MonthlyExpenseGroupBreakdown = {
  month: string;
  needs_total: number | string;
  wants_total: number | string;
  investments_total: number | string;
};

export type MonthlyExpenseGroupsState = {
  data: MonthlyExpenseGroupBreakdown | null;
  loading: boolean;
  error: string;
};

export type MonthlyExpenseGroupsParams = {
  month?: string;
};
