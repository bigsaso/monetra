"use client";

import CategoryBreakdownChart from "./CategoryBreakdownChart";
import ExpenseGroupPieChart from "./ExpenseGroupPieChart";
import NetFlowSummary from "./NetFlowSummary";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "./ui/card";

export default function MonthlyExpenseSummaryCard({
  className = "",
  month,
  monthLabel,
  netFlow,
  onPreviousMonth,
  onNextMonth,
  expenseGroups,
  expenseGroupsLoading,
  expenseGroupsError,
  categoryBreakdown,
  categoryBreakdownLoading,
  categoryBreakdownError
}) {
  return (
    <Card className={`lg:col-span-12 ${className}`.trim()}>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>Monthly expense summary</CardTitle>
          <CardDescription>
            Net flow and expense mix for {monthLabel}.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onPreviousMonth}>
            Prev
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium text-slate-700">
            {monthLabel}
          </span>
          <Button type="button" variant="outline" onClick={onNextMonth}>
            Next
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-8">
        <div className="rounded-xl border border-slate-200/70 bg-white/70 p-5">
          <NetFlowSummary
            netFlow={netFlow}
            monthLabel={monthLabel}
            month={month}
            description="Income minus expenses for the selected month."
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ExpenseGroupPieChart
            className="shadow-none"
            data={expenseGroups}
            loading={expenseGroupsLoading}
            error={expenseGroupsError}
            month={month}
            title="Expense groups"
            description="Needs, wants, investments, and savings this month."
            showMonthControls={false}
          />

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Expense categories</CardTitle>
              <CardDescription>
                Share of spending by category in {monthLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {categoryBreakdownLoading ? (
                <p>Loading category breakdown...</p>
              ) : null}
              {categoryBreakdownError ? (
                <p className="text-rose-600">{categoryBreakdownError}</p>
              ) : null}
              {!categoryBreakdownLoading && !categoryBreakdownError ? (
                <CategoryBreakdownChart data={categoryBreakdown} month={month} />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
