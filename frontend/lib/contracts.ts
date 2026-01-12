export type MonthlyExpenseGroupBreakdown = {
  month: string;
  income_total: number | string;
  needs_total: number | string;
  wants_total: number | string;
  investments_total: number | string;
  projected_total_income?: number | string;
  projected_total_expenses?: number | string;
  home_currency?: string;
  income_source_currencies?: string[];
  needs_source_currencies?: string[];
  wants_source_currencies?: string[];
  investments_source_currencies?: string[];
};

export type MonthlyExpenseGroupsState = {
  data: MonthlyExpenseGroupBreakdown | null;
  loading: boolean;
  error: string;
};

export type MonthlyExpenseGroupsParams = {
  month?: string;
};
