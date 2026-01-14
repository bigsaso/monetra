import calendar
import os
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR

import bcrypt
from fastapi import FastAPI, HTTPException, Header, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    UniqueConstraint,
    and_,
    create_engine,
    func,
    insert,
    select,
    update,
)
from sqlalchemy.exc import IntegrityError

from backend.budget_engine import BudgetRule, Transaction, evaluate_budget
from backend.csv_parser import CSVParseResult, ParsedTransaction, parse_transactions_csv
from backend.currency_conversion import (
    CompositeRateProvider,
    FrankfurterRateProvider,
    StaticRateProvider,
    convert_amount,
)
from backend.income_projection import IncomeTransaction, RecurringSchedule, project_income
from backend.recurring_projection import ActualTransaction, project_recurring_schedule

app = FastAPI()

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

database_url = os.getenv("DATABASE_URL", "sqlite:///./monetra.db")
connect_args = {}
if database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(database_url, connect_args=connect_args)
metadata = MetaData()

def normalize_currency(value: str) -> str:
    normalized = value.strip().upper()
    if len(normalized) != 3 or not normalized.isalpha():
        raise ValueError("Currency must be a 3-letter ISO 4217 code.")
    return normalized


def get_system_default_currency() -> str:
    raw = os.getenv("DEFAULT_CURRENCY", "USD")
    try:
        return normalize_currency(raw)
    except ValueError:
        return "USD"


SYSTEM_DEFAULT_CURRENCY = get_system_default_currency()
FX_PROVIDER = CompositeRateProvider(
    primary=FrankfurterRateProvider(),
    fallback=StaticRateProvider(),
)

DEFAULT_CATEGORIES = [
    "Groceries",
    "Rent",
    "Dining",
    "Utilities",
    "Travel",
    "Subscriptions",
    "Other",
]

users = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("email", String(255), unique=True, nullable=False),
    Column("hashed_password", String(255), nullable=False),
    Column("home_currency", String(3)),
    Column("created_at", DateTime, nullable=False, server_default=func.now()),
)

accounts = Table(
    "accounts",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("name", String(255), nullable=False),
    Column("type", String(50), nullable=False),
    Column("institution", String(255)),
    Column("created_at", DateTime, nullable=False, server_default=func.now()),
)

categories = Table(
    "categories",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("name", String(255), nullable=False),
    Column("group", String(20)),
    Column("created_at", DateTime, nullable=False, server_default=func.now()),
    UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
)

transactions = Table(
    "transactions",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("account_id", Integer, ForeignKey("accounts.id"), nullable=False),
    Column("amount", Numeric(12, 2), nullable=False),
    Column("currency", String(3), nullable=False, server_default=SYSTEM_DEFAULT_CURRENCY),
    Column("type", String(20), nullable=False),
    Column("category", String(255)),
    Column("date", Date, nullable=False),
    Column("converted_at", Date),
    Column("notes", String(500)),
)

budget_rules = Table(
    "budget_rules",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("rule_type", String(50), nullable=False),
    Column("amount", Numeric(12, 2), nullable=False),
    Column("category", String(255)),
    Column("account_id", Integer, ForeignKey("accounts.id")),
    Column("created_at", DateTime, nullable=False, server_default=func.now()),
)

pay_schedules = Table(
    "pay_schedules",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("amount", Numeric(12, 2), nullable=False),
    Column("currency", String(3), nullable=False, server_default=SYSTEM_DEFAULT_CURRENCY),
    Column("kind", String(20), nullable=False, server_default="income"),
    Column("frequency", String(50), nullable=False),
    Column("start_date", Date, nullable=False),
    Column("account_id", Integer, ForeignKey("accounts.id"), nullable=False),
    Column("category_id", Integer, ForeignKey("categories.id")),
    Column("notes", String(500)),
    Column("created_at", DateTime, nullable=False, server_default=func.now()),
)

investments = Table(
    "investments",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("name", String(255), nullable=False),
    Column("symbol", String(50)),
    Column("asset_type", String(50), nullable=False),
    Column("total_shares", Numeric(18, 8), nullable=False, server_default="0"),
    Column("total_cost_basis", Numeric(18, 8), nullable=False, server_default="0"),
    Column("average_cost_per_share", Numeric(18, 8), nullable=False, server_default="0"),
    Column("created_at", DateTime, nullable=False, server_default=func.now()),
)

investment_entries = Table(
    "investment_entries",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("investment_id", Integer, ForeignKey("investments.id"), nullable=False),
    Column("transaction_id", Integer, ForeignKey("transactions.id"), nullable=False),
    Column("quantity", Numeric(18, 8), nullable=False),
    Column("price", Numeric(12, 5), nullable=False),
    Column("price_per_share", Numeric(12, 5)),
    Column("total_amount", Numeric(12, 2)),
    Column("currency", String(3)),
    Column("cost_of_sold_shares", Numeric(12, 2)),
    Column("realized_profit_loss", Numeric(12, 2)),
    Column("type", String(10), nullable=False),
    Column("date", Date, nullable=False),
)

espp_periods = Table(
    "espp_periods",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("name", String(255), nullable=False),
    Column("stock_ticker", String(50), nullable=False),
    Column("stock_currency", String(3), nullable=False),
    Column("start_date", Date, nullable=False),
    Column("status", String(10), nullable=False, server_default="open"),
    Column("created_at", DateTime, nullable=False, server_default=func.now()),
)

espp_deposits = Table(
    "espp_deposits",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("espp_period_id", Integer, ForeignKey("espp_periods.id"), nullable=False),
    Column("date", Date, nullable=False),
    Column("amount_home_currency", Numeric(12, 2), nullable=False),
)

espp_closure = Table(
    "espp_closure",
    metadata,
    Column("espp_period_id", Integer, ForeignKey("espp_periods.id"), primary_key=True),
    Column("open_fmv", Numeric(12, 5)),
    Column("close_fmv", Numeric(12, 5)),
    Column("exchange_rate", Numeric(12, 6)),
    Column("min_fmv", Numeric(12, 5)),
    Column("purchase_price", Numeric(12, 5)),
    Column("total_invested_home", Numeric(12, 2)),
    Column("total_invested_stock_currency", Numeric(12, 2)),
    Column("shares_purchased", Numeric(18, 8)),
    Column("shares_withheld", Numeric(18, 8)),
    Column("shares_left", Numeric(18, 8)),
    Column("taxes_paid", Numeric(12, 2)),
    Column("paid_with_shares", Numeric(18, 8)),
    Column("refunded_from_taxes", Numeric(12, 2)),
    Column("unused_for_shares", Numeric(12, 2)),
    Column("total_refunded", Numeric(12, 2)),
    Column("closed_at", DateTime),
)

@app.on_event("startup")
def init_db() -> None:
    metadata.create_all(engine)


class CredentialsPayload(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime | None = None


class UserSettingsPayload(BaseModel):
    home_currency: str | None = None


class UserSettingsResponse(BaseModel):
    id: int
    email: str
    home_currency: str


class AccountBase(BaseModel):
    name: str
    type: str
    institution: str | None = None


class AccountResponse(AccountBase):
    id: int
    user_id: int
    created_at: datetime | None = None


class TransactionType:
    values = {"income", "expense", "investment"}

    @classmethod
    def validate(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in cls.values:
            raise ValueError("Invalid transaction type.")
        return normalized


class RecurringScheduleKind:
    values = {"income", "expense", "investment"}

    @classmethod
    def validate(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in cls.values:
            raise ValueError("Invalid recurring schedule kind.")
        return normalized


class AccountType:
    values = {"checking", "credit", "investment", "savings"}

    @classmethod
    def validate(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in cls.values:
            raise ValueError("Invalid account type.")
        return normalized


class InvestmentAssetType:
    values = {"stock", "etf", "mutual_fund", "crypto", "bond", "cash", "real_estate", "other"}

    @classmethod
    def validate(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in cls.values:
            raise ValueError("Invalid asset type.")
        return normalized


class EsppPeriodStatus:
    values = {"open", "closed"}

    @classmethod
    def validate(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in cls.values:
            raise ValueError("Invalid ESPP period status.")
        return normalized


ESPP_PRICE_QUANT = Decimal("0.00001")
ESPP_MONEY_QUANT = Decimal("0.01")
ESPP_FX_QUANT = Decimal("0.000001")
ESPP_SHARES_QUANT = Decimal("0.00000001")
ESPP_DISCOUNT_RATE = Decimal("0.85")
ESPP_TAX_RATE = Decimal("0.47")


class CategoryGroup:
    values = {"needs", "wants", "investments"}

    @classmethod
    def normalize(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in cls.values:
            raise ValueError("Invalid category group.")
        return normalized


class AccountPayload(BaseModel):
    name: str
    type: str
    institution: str | None = None

    @classmethod
    def validate_payload(cls, payload: "AccountPayload") -> "AccountPayload":
        payload.type = AccountType.validate(payload.type)
        payload.name = payload.name.strip()
        payload.institution = payload.institution.strip() if payload.institution else None
        if not payload.name:
            raise ValueError("Account name required.")
        return payload


class TransactionPayload(BaseModel):
    account_id: int
    amount: Decimal
    currency: str | None = None
    type: str
    category: str | None = None
    date: date
    notes: str | None = None
    investment_id: int | None = None
    quantity: Decimal | None = None
    price: Decimal | None = None
    investment_type: str | None = None

    @classmethod
    def validate_payload(cls, payload: "TransactionPayload") -> "TransactionPayload":
        payload.type = TransactionType.validate(payload.type)
        if payload.category is not None:
            payload.category = payload.category.strip()
        payload.currency = payload.currency.strip() if payload.currency else None
        payload.notes = payload.notes.strip() if payload.notes else None
        if payload.amount <= 0:
            raise ValueError("Amount must be greater than zero.")
        return payload


class TransactionResponse(TransactionPayload):
    id: int
    user_id: int
    currency: str


class ConvertToHomePayload(BaseModel):
    record_id: int
    conversion_date: date


class ConvertToHomeResponse(BaseModel):
    transaction_id: int
    amount: Decimal
    currency: str
    converted_at: date


class BudgetRulePayload(BaseModel):
    rule_type: str
    amount: Decimal
    category: str | None = None
    account_id: int | None = None

    @classmethod
    def validate_payload(cls, payload: "BudgetRulePayload") -> "BudgetRulePayload":
        normalized_type = payload.rule_type.strip().lower()
        allowed_types = {"category_cap", "account_cap", "savings_target"}
        if normalized_type not in allowed_types:
            raise ValueError("Invalid budget rule type.")
        payload.rule_type = normalized_type
        if payload.amount <= 0:
            raise ValueError("Budget amount must be greater than zero.")

        payload.category = payload.category.strip() if payload.category else None
        if normalized_type == "category_cap":
            if not payload.category:
                raise ValueError("Category cap requires a category.")
            payload.account_id = None
        elif normalized_type == "account_cap":
            if payload.account_id is None:
                raise ValueError("Account cap requires an account.")
            payload.category = None
        else:
            payload.category = None
            payload.account_id = None

        return payload


class BudgetRuleResponse(BaseModel):
    id: int
    user_id: int
    rule_type: str
    amount: Decimal
    category: str | None = None
    account_id: int | None = None
    created_at: datetime | None = None


class BudgetEvaluationResponse(BaseModel):
    rule_id: int
    rule_type: str
    amount: Decimal
    category: str | None = None
    account_id: int | None = None
    period: str
    start_date: date
    end_date: date
    current_value: Decimal
    remaining: Decimal
    status: str
    home_currency: str | None = None
    source_currencies: list[str] | None = None


class MonthlyTrendResponse(BaseModel):
    month: str
    total_income: Decimal
    total_expenses: Decimal
    total_regular_expenses: Decimal
    total_investment_expenses: Decimal
    net_cashflow: Decimal
    projected_total_income: Decimal | None = None
    projected_total_expenses: Decimal | None = None
    projected_total_regular_expenses: Decimal | None = None
    projected_total_investment_expenses: Decimal | None = None
    projected_total_income_current_month: Decimal | None = None
    projected_total_expenses_current_month: Decimal | None = None
    projected_total_regular_expenses_current_month: Decimal | None = None
    projected_total_investment_expenses_current_month: Decimal | None = None
    home_currency: str | None = None
    source_currencies: list[str] | None = None


class NetFlowSummaryResponse(BaseModel):
    net_flow_current_month: Decimal
    net_flow_previous_month: Decimal
    percentage_change: Decimal | None = None
    home_currency: str | None = None
    source_currencies_current_month: list[str] | None = None
    source_currencies_previous_month: list[str] | None = None


class CategoryBreakdownResponse(BaseModel):
    category: str
    total_spent: Decimal
    percentage_of_total: Decimal
    home_currency: str | None = None
    source_currencies: list[str] | None = None


class MonthlyExpenseGroupResponse(BaseModel):
    month: str
    income_total: Decimal
    needs_total: Decimal
    wants_total: Decimal
    investments_total: Decimal
    projected_total_income: Decimal | None = None
    projected_total_expenses: Decimal | None = None
    home_currency: str | None = None
    income_source_currencies: list[str] | None = None
    needs_source_currencies: list[str] | None = None
    wants_source_currencies: list[str] | None = None
    investments_source_currencies: list[str] | None = None


class ExpenseTrendBucket(BaseModel):
    bucket_start: date
    total: Decimal
    source_currencies: list[str] | None = None


class ExpenseTrendResponse(BaseModel):
    resolution: str
    timeframe: str
    home_currency: str | None = None
    buckets: list[ExpenseTrendBucket]


class CategoryTrendBucket(BaseModel):
    bucket_start: date
    totals_by_category: dict[str, Decimal]
    source_currencies: list[str] | None = None


class CategoryTrendResponse(BaseModel):
    resolution: str
    timeframe: str
    home_currency: str | None = None
    buckets: list[CategoryTrendBucket]


class IncomeProjectionEntry(BaseModel):
    date: date
    amount: Decimal
    account_id: int
    source: str
    notes: str | None = None


class RecurringProjectionEntry(BaseModel):
    date: date
    amount: Decimal
    kind: str
    schedule_id: int
    source: str
    notes: str | None = None


def _normalize_frequency(value: str) -> str:
    normalized = "".join(ch for ch in value.strip().lower() if ch.isalnum())
    if normalized == "byweekly":
        return "biweekly"
    return normalized


class RecurringSchedulePayload(BaseModel):
    amount: Decimal
    currency: str | None = None
    start_date: date
    account_id: int
    frequency: str | None = "biweekly"
    kind: str = "income"
    category_id: int | None = None
    notes: str | None = None

    @classmethod
    def validate_payload(
        cls, payload: "RecurringSchedulePayload"
    ) -> "RecurringSchedulePayload":
        if payload.amount <= 0:
            raise ValueError("Recurring schedule amount must be greater than zero.")
        payload.currency = payload.currency.strip() if payload.currency else None
        normalized = _normalize_frequency(payload.frequency or "biweekly")
        if normalized not in {"weekly", "biweekly", "monthly", "yearly"}:
            raise ValueError("Only weekly, biweekly, monthly, or yearly schedules are supported.")
        payload.frequency = normalized
        payload.kind = RecurringScheduleKind.validate(payload.kind or "income")
        payload.notes = payload.notes.strip() if payload.notes else None
        return payload


class RecurringScheduleResponse(BaseModel):
    id: int
    user_id: int
    amount: Decimal
    currency: str
    start_date: date
    account_id: int
    frequency: str
    kind: str
    category_id: int | None = None
    notes: str | None = None
    created_at: datetime | None = None


class CategoryPayload(BaseModel):
    name: str
    group: str | None = None

    @classmethod
    def validate_payload(cls, payload: "CategoryPayload") -> "CategoryPayload":
        payload.name = payload.name.strip()
        if not payload.name:
            raise ValueError("Category name required.")
        if payload.group is not None:
            payload.group = CategoryGroup.normalize(payload.group)
        return payload


class CategoryResponse(BaseModel):
    id: int
    user_id: int
    name: str
    group: str | None = None
    created_at: datetime | None = None


class InvestmentPayload(BaseModel):
    name: str
    asset_type: str
    symbol: str | None = None

    @classmethod
    def validate_payload(cls, payload: "InvestmentPayload") -> "InvestmentPayload":
        payload.name = payload.name.strip()
        if not payload.name:
            raise ValueError("Investment name required.")
        payload.asset_type = InvestmentAssetType.validate(payload.asset_type)
        if payload.symbol is not None:
            payload.symbol = payload.symbol.strip().upper() or None
        return payload


class InvestmentResponse(BaseModel):
    id: int
    user_id: int
    name: str
    asset_type: str
    symbol: str | None = None
    created_at: datetime | None = None


class InvestmentPositionResponse(BaseModel):
    id: int
    name: str
    symbol: str | None = None
    total_shares: Decimal
    average_cost_per_share: Decimal
    total_cost_basis: Decimal
    currency: str | None = None


class InvestmentActivityResponse(BaseModel):
    id: int
    investment_id: int
    investment_name: str
    investment_symbol: str | None = None
    transaction_id: int
    type: str
    quantity: Decimal
    price: Decimal
    price_per_share: Decimal | None = None
    total_amount: Decimal | None = None
    currency: str | None = None
    realized_profit_loss: Decimal | None = None
    date: date


class InvestmentRealizedResponse(BaseModel):
    id: int
    investment_id: int
    investment_name: str
    investment_symbol: str | None = None
    quantity_sold: Decimal
    average_buy_price: Decimal | None = None
    sell_price_per_share: Decimal | None = None
    total_proceeds: Decimal | None = None
    realized_profit_loss: Decimal | None = None
    currency: str | None = None
    sell_date: date
    converted_at: date | None = None


class EsppPeriodPayload(BaseModel):
    name: str
    stock_ticker: str
    stock_currency: str
    start_date: date
    status: str | None = None

    @classmethod
    def validate_payload(cls, payload: "EsppPeriodPayload") -> "EsppPeriodPayload":
        payload.name = payload.name.strip()
        if not payload.name:
            raise ValueError("ESPP period name required.")
        payload.stock_ticker = payload.stock_ticker.strip().upper()
        if not payload.stock_ticker:
            raise ValueError("Stock ticker required.")
        payload.stock_currency = normalize_currency(payload.stock_currency)
        if payload.status is not None:
            payload.status = EsppPeriodStatus.validate(payload.status)
        return payload


class EsppPeriodResponse(BaseModel):
    id: int
    user_id: int
    name: str
    stock_ticker: str
    stock_currency: str
    start_date: date
    status: str
    created_at: datetime | None = None


class EsppDepositPayload(BaseModel):
    date: date
    amount_home_currency: Decimal

    @classmethod
    def validate_payload(cls, payload: "EsppDepositPayload") -> "EsppDepositPayload":
        if payload.amount_home_currency < 0:
            raise ValueError("Deposit amount cannot be negative.")
        return payload


class EsppDepositResponse(BaseModel):
    id: int
    espp_period_id: int
    date: date
    amount_home_currency: Decimal


class EsppSummaryPayload(BaseModel):
    open_fmv: Decimal | None = None
    close_fmv: Decimal | None = None
    exchange_rate: Decimal | None = None

    @classmethod
    def validate_payload(cls, payload: "EsppSummaryPayload") -> "EsppSummaryPayload":
        if payload.open_fmv is not None and payload.open_fmv < 0:
            raise ValueError("Open FMV cannot be negative.")
        if payload.close_fmv is not None and payload.close_fmv < 0:
            raise ValueError("Close FMV cannot be negative.")
        if payload.exchange_rate is not None and payload.exchange_rate < 0:
            raise ValueError("Exchange rate cannot be negative.")
        return payload


class EsppSummaryResponse(BaseModel):
    open_fmv: Decimal | None = None
    close_fmv: Decimal | None = None
    exchange_rate: Decimal | None = None
    min_fmv: Decimal | None = None
    purchase_price: Decimal | None = None
    total_invested_home: Decimal
    total_invested_stock_currency: Decimal | None = None
    shares_purchased: Decimal | None = None
    taxes_paid: Decimal | None = None
    shares_withheld: Decimal | None = None
    shares_left: Decimal | None = None
    paid_with_shares: Decimal | None = None
    refunded_from_taxes: Decimal | None = None
    unused_for_shares: Decimal | None = None
    total_refunded: Decimal | None = None


class EsppOpenFmvPayload(BaseModel):
    open_fmv: Decimal | None = None

    @classmethod
    def validate_payload(cls, payload: "EsppOpenFmvPayload") -> "EsppOpenFmvPayload":
        if payload.open_fmv is not None and payload.open_fmv < 0:
            raise ValueError("Open FMV cannot be negative.")
        return payload


class EsppOpenFmvResponse(BaseModel):
    open_fmv: Decimal | None = None


class EsppClosePayload(BaseModel):
    account_id: int
    open_fmv: Decimal
    close_fmv: Decimal
    exchange_rate: Decimal

    @classmethod
    def validate_payload(cls, payload: "EsppClosePayload") -> "EsppClosePayload":
        if payload.account_id <= 0:
            raise ValueError("Account is required.")
        if payload.open_fmv <= 0:
            raise ValueError("Open FMV must be greater than zero.")
        if payload.close_fmv <= 0:
            raise ValueError("Close FMV must be greater than zero.")
        if payload.exchange_rate <= 0:
            raise ValueError("Exchange rate must be greater than zero.")
        return payload


class EsppCloseResponse(BaseModel):
    period_id: int
    status: str
    transaction_id: int
    investment_id: int
    summary: EsppSummaryResponse


class TransactionImportPreviewResponse(BaseModel):
    transactions: list[ParsedTransaction]
    total_count: int
    total_amount: Decimal


class TransactionImportRow(BaseModel):
    date: date
    description: str
    amount: Decimal
    category: str | None = None
    account_id: int | None = None
    notes: str | None = None


class TransactionImportCommitPayload(BaseModel):
    account_id: int | None = None
    transactions: list[TransactionImportRow]


class TransactionImportCommitResponse(BaseModel):
    inserted_count: int


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_user_id(x_user_id: str | None = Header(None)) -> int:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user identity.")
    try:
        user_id = int(x_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user identity.") from exc
    with engine.begin() as conn:
        result = conn.execute(select(users.c.id).where(users.c.id == user_id))
        if not result.first():
            raise HTTPException(status_code=404, detail="User not found.")
    return user_id


def resolve_default_currency(conn, user_id: int) -> str:
    home_currency = conn.execute(
        select(users.c.home_currency).where(users.c.id == user_id)
    ).scalar_one_or_none()
    if home_currency:
        try:
            return normalize_currency(home_currency)
        except ValueError:
            pass
    first_currency = conn.execute(
        select(transactions.c.currency)
        .where(transactions.c.user_id == user_id)
        .order_by(transactions.c.id.asc())
        .limit(1)
    ).scalar_one_or_none()
    if first_currency:
        try:
            return normalize_currency(first_currency)
        except ValueError:
            pass
    return SYSTEM_DEFAULT_CURRENCY


def resolve_currency(value: str | None, conn, user_id: int) -> str:
    if value:
        return normalize_currency(value)
    return resolve_default_currency(conn, user_id)


def set_home_currency_if_missing(conn, user_id: int, currency: str) -> None:
    current = conn.execute(
        select(users.c.home_currency).where(users.c.id == user_id)
    ).scalar_one_or_none()
    if current:
        try:
            normalize_currency(current)
            return
        except ValueError:
            pass
    conn.execute(
        update(users)
        .where(users.c.id == user_id)
        .values(home_currency=currency)
    )


def ensure_default_categories(conn, user_id: int) -> None:
    existing = conn.execute(
        select(categories.c.id).where(categories.c.user_id == user_id).limit(1)
    ).first()
    if existing:
        return
    conn.execute(
        insert(categories),
        [{"user_id": user_id, "name": name} for name in DEFAULT_CATEGORIES],
    )


def ensure_single_open_espp_period(conn, user_id: int, exclude_period_id: int | None = None) -> None:
    conditions = [espp_periods.c.user_id == user_id, espp_periods.c.status == "open"]
    if exclude_period_id is not None:
        conditions.append(espp_periods.c.id != exclude_period_id)
    existing = conn.execute(select(espp_periods.c.id).where(*conditions).limit(1)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Only one ESPP period can be open at a time.")


def build_espp_deposit_schedule(start_date: date) -> list[date]:
    return [start_date + timedelta(days=14 * offset) for offset in range(13)]


def ensure_espp_deposit_count(conn, period_id: int) -> None:
    count = conn.execute(
        select(func.count())
        .select_from(espp_deposits)
        .where(espp_deposits.c.espp_period_id == period_id)
    ).scalar_one()
    if count != 13:
        raise HTTPException(status_code=400, detail="ESPP period must have exactly 13 deposits.")


def compute_espp_summary(
    total_invested_home: Decimal,
    open_fmv: Decimal | None,
    close_fmv: Decimal | None,
    exchange_rate: Decimal | None,
) -> EsppSummaryResponse:
    total_invested_home = total_invested_home.quantize(ESPP_MONEY_QUANT)
    normalized_open = open_fmv.quantize(ESPP_PRICE_QUANT) if open_fmv is not None else None
    normalized_close = close_fmv.quantize(ESPP_PRICE_QUANT) if close_fmv is not None else None
    normalized_fx = exchange_rate.quantize(ESPP_FX_QUANT) if exchange_rate is not None else None

    min_fmv = None
    if normalized_open is not None and normalized_close is not None:
        min_fmv = min(normalized_open, normalized_close).quantize(ESPP_PRICE_QUANT)

    purchase_price = (
        (min_fmv * ESPP_DISCOUNT_RATE).quantize(ESPP_PRICE_QUANT)
        if min_fmv is not None
        else None
    )

    total_invested_stock_currency = None
    if normalized_fx is not None and normalized_fx > 0:
        total_invested_stock_currency = (total_invested_home * normalized_fx).quantize(
            ESPP_MONEY_QUANT
        )

    shares_purchased = None
    if (
        total_invested_stock_currency is not None
        and purchase_price is not None
        and purchase_price > 0
    ):
        shares_purchased = (
            total_invested_stock_currency / purchase_price
        ).to_integral_value(rounding=ROUND_FLOOR)
        shares_purchased = shares_purchased.quantize(ESPP_SHARES_QUANT)

    taxes_paid = None
    if (
        shares_purchased is not None
        and normalized_close is not None
        and purchase_price is not None
    ):
        taxes_paid = (
            shares_purchased
            * (normalized_close - purchase_price)
            * ESPP_TAX_RATE
        ).quantize(ESPP_MONEY_QUANT)

    shares_withheld = None
    if taxes_paid is not None and normalized_close is not None and normalized_close > 0:
        shares_withheld = (taxes_paid / normalized_close).to_integral_value(
            rounding=ROUND_CEILING
        )
        shares_withheld = shares_withheld.quantize(ESPP_SHARES_QUANT)

    shares_left = None
    if shares_purchased is not None and shares_withheld is not None:
        shares_left = (shares_purchased - shares_withheld).quantize(ESPP_SHARES_QUANT)

    paid_with_shares = None
    if shares_withheld is not None and normalized_close is not None:
        paid_with_shares = (shares_withheld * normalized_close).quantize(
            ESPP_MONEY_QUANT
        )

    refunded_from_taxes = None
    if paid_with_shares is not None and taxes_paid is not None:
        refunded_from_taxes = (paid_with_shares - taxes_paid).quantize(
            ESPP_MONEY_QUANT
        )

    unused_for_shares = None
    if (
        total_invested_stock_currency is not None
        and shares_purchased is not None
        and purchase_price is not None
    ):
        unused_for_shares = (
            total_invested_stock_currency - (shares_purchased * purchase_price)
        ).quantize(ESPP_MONEY_QUANT)

    total_refunded = None
    if refunded_from_taxes is not None and unused_for_shares is not None:
        total_refunded = (refunded_from_taxes + unused_for_shares).quantize(
            ESPP_MONEY_QUANT
        )

    return EsppSummaryResponse(
        open_fmv=normalized_open,
        close_fmv=normalized_close,
        exchange_rate=normalized_fx,
        min_fmv=min_fmv,
        purchase_price=purchase_price,
        total_invested_home=total_invested_home,
        total_invested_stock_currency=total_invested_stock_currency,
        shares_purchased=shares_purchased,
        taxes_paid=taxes_paid,
        shares_withheld=shares_withheld,
        shares_left=shares_left,
        paid_with_shares=paid_with_shares,
        refunded_from_taxes=refunded_from_taxes,
        unused_for_shares=unused_for_shares,
        total_refunded=total_refunded,
    )


def category_in_use(conn, user_id: int, name: str) -> bool:
    txn_match = conn.execute(
        select(transactions.c.id)
        .where(transactions.c.user_id == user_id, transactions.c.category == name)
        .limit(1)
    ).first()
    if txn_match:
        return True
    rule_match = conn.execute(
        select(budget_rules.c.id)
        .where(budget_rules.c.user_id == user_id, budget_rules.c.category == name)
        .limit(1)
    ).first()
    return bool(rule_match)


def get_category_group(conn, user_id: int, name: str | None) -> str | None:
    if not name:
        return None
    result = conn.execute(
        select(categories.c.group).where(categories.c.user_id == user_id, categories.c.name == name)
    ).first()
    if not result:
        return None
    return result[0]


def extract_investment_entry(payload: TransactionPayload) -> dict | None:
    provided = any(
        value is not None
        for value in (
            payload.investment_id,
            payload.quantity,
            payload.price,
            payload.investment_type,
        )
    )
    if not provided:
        return None
    if payload.investment_id is None or payload.quantity is None or payload.price is None or payload.investment_type is None:
        raise ValueError("Investment entries require investment_id, quantity, price, and investment_type.")
    investment_type = payload.investment_type.strip().lower()
    if investment_type not in {"buy", "sell"}:
        raise ValueError("Investment type must be 'buy' or 'sell'.")
    if payload.quantity <= 0:
        raise ValueError("Investment quantity must be greater than zero.")
    if payload.price <= 0:
        raise ValueError("Investment price must be greater than zero.")
    return {
        "investment_id": payload.investment_id,
        "quantity": payload.quantity,
        "price": payload.price,
        "type": investment_type,
        "total_amount": payload.amount,
    }


def recalculate_investment_position(conn, user_id: int, investment_id: int) -> None:
    stmt = (
        select(
            investment_entries.c.id,
            investment_entries.c.quantity,
            investment_entries.c.price,
            investment_entries.c.price_per_share,
            investment_entries.c.total_amount,
            investment_entries.c.currency,
            investment_entries.c.type,
            transactions.c.amount.label("transaction_amount"),
            transactions.c.currency.label("transaction_currency"),
        )
        .select_from(
            investment_entries.join(
                transactions,
                (investment_entries.c.transaction_id == transactions.c.id)
                & (investment_entries.c.user_id == transactions.c.user_id),
            )
        )
        .where(
            investment_entries.c.user_id == user_id,
            investment_entries.c.investment_id == investment_id,
        )
        .order_by(investment_entries.c.date.asc(), investment_entries.c.id.asc())
    )
    entries = conn.execute(stmt).mappings().all()

    total_shares = Decimal("0")
    total_cost_basis = Decimal("0")
    average_cost_per_share = Decimal("0")
    entry_updates: list[dict] = []

    for entry in entries:
        quantity = entry["quantity"]
        price_per_share = entry["price_per_share"] or entry["price"]
        total_amount = entry["total_amount"]
        if total_amount is None:
            total_amount = entry["transaction_amount"]
        if total_amount is None and price_per_share is not None:
            total_amount = (quantity * price_per_share).quantize(Decimal("0.01"))
        if price_per_share is None or total_amount is None:
            raise ValueError("Investment transactions require price_per_share and total_amount.")

        entry_type = entry["type"]
        realized_profit_loss = None
        if entry_type == "buy":
            total_shares += quantity
            total_cost_basis += total_amount
            if total_shares > 0:
                average_cost_per_share = total_cost_basis / total_shares
        elif entry_type == "sell":
            if quantity > total_shares:
                raise ValueError("Sell quantity exceeds available shares.")
            cost_basis = average_cost_per_share * quantity
            realized_profit_loss = total_amount - cost_basis
            total_shares -= quantity
            total_cost_basis -= cost_basis
            if total_shares > 0:
                average_cost_per_share = total_cost_basis / total_shares
            else:
                total_cost_basis = Decimal("0")
                average_cost_per_share = Decimal("0")
        else:
            raise ValueError("Investment type must be 'buy' or 'sell'.")

        update_values = {}
        if entry["price_per_share"] is None:
            update_values["price_per_share"] = price_per_share
        if entry["total_amount"] is None:
            update_values["total_amount"] = total_amount
        if entry["currency"] is None and entry["transaction_currency"] is not None:
            update_values["currency"] = entry["transaction_currency"]
        if entry_type == "sell":
            update_values["cost_of_sold_shares"] = cost_basis
            update_values["realized_profit_loss"] = realized_profit_loss
        if update_values:
            update_values["id"] = entry["id"]
            entry_updates.append(update_values)

    conn.execute(
        update(investments)
        .where(investments.c.id == investment_id, investments.c.user_id == user_id)
        .values(
            total_shares=total_shares,
            total_cost_basis=total_cost_basis,
            average_cost_per_share=average_cost_per_share,
        )
    )

    for entry_update in entry_updates:
        entry_id = entry_update.pop("id")
        conn.execute(
            update(investment_entries)
            .where(investment_entries.c.id == entry_id)
            .values(**entry_update)
        )


def get_period_range(period: str, today: date) -> tuple[date, date]:
    normalized = period.strip().lower()
    if normalized == "monthly":
        return today.replace(day=1), today
    raise ValueError("Unsupported period. Use 'monthly'.")


def month_start(value: date) -> date:
    return value.replace(day=1)


def shift_month(value: date, months: int) -> date:
    month_index = (value.year * 12 + value.month - 1) + months
    year = month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def shift_month_keep_day(value: date, months: int) -> date:
    month_index = (value.year * 12 + value.month - 1) + months
    year = month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(value.day, last_day)
    return date(year, month, day)


def iter_months(start_value: date, end_value: date) -> list[date]:
    months: list[date] = []
    cursor = month_start(start_value)
    end_month = month_start(end_value)
    while cursor <= end_month:
        months.append(cursor)
        cursor = shift_month(cursor, 1)
    return months


def month_end(value: date) -> date:
    next_month = shift_month(month_start(value), 1)
    return next_month - timedelta(days=1)


def parse_month_value(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m").date()
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError("Invalid month format. Use YYYY-MM.") from exc


REPORT_RESOLUTIONS = {"daily", "weekly", "monthly", "yearly"}
EXPENSE_TIMEFRAMES = {"1W", "1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y"}
CATEGORY_TIMEFRAMES = {"30D", "3M", "6M", "1Y", "2Y"}


def normalize_report_resolution(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in REPORT_RESOLUTIONS:
        raise ValueError("Invalid resolution.")
    return normalized


def normalize_report_timeframe(value: str, allowed: set[str]) -> str:
    normalized = value.strip().upper()
    if normalized not in allowed:
        raise ValueError("Invalid timeframe.")
    return normalized


def get_report_bucket_start(value: date, resolution: str) -> date:
    if resolution == "weekly":
        return value - timedelta(days=value.weekday())
    if resolution == "monthly":
        return value.replace(day=1)
    if resolution == "yearly":
        return value.replace(month=1, day=1)
    return value


def add_report_interval(value: date, resolution: str) -> date:
    if resolution == "weekly":
        return value + timedelta(days=7)
    if resolution == "monthly":
        return shift_month(value, 1)
    if resolution == "yearly":
        return date(value.year + 1, 1, 1)
    return value + timedelta(days=1)


def expense_timeframe_start(end_date: date, timeframe: str) -> date:
    if timeframe == "1W":
        return end_date - timedelta(days=6)
    if timeframe == "1M":
        return shift_month_keep_day(end_date, -1)
    if timeframe == "3M":
        return shift_month_keep_day(end_date, -3)
    if timeframe == "6M":
        return shift_month_keep_day(end_date, -6)
    if timeframe == "YTD":
        return date(end_date.year, 1, 1)
    if timeframe == "1Y":
        return shift_month_keep_day(end_date, -12)
    if timeframe == "2Y":
        return shift_month_keep_day(end_date, -24)
    if timeframe == "5Y":
        return shift_month_keep_day(end_date, -60)
    raise ValueError("Invalid timeframe.")


def category_timeframe_start(end_date: date, timeframe: str) -> date:
    if timeframe == "30D":
        return end_date - timedelta(days=29)
    if timeframe == "3M":
        return shift_month_keep_day(end_date, -3)
    if timeframe == "6M":
        return shift_month_keep_day(end_date, -6)
    if timeframe == "1Y":
        return shift_month_keep_day(end_date, -12)
    if timeframe == "2Y":
        return shift_month_keep_day(end_date, -24)
    raise ValueError("Invalid timeframe.")


def coerce_decimal(value: Decimal | float | int | str) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def safe_normalize_currency(value: str | None, fallback: str) -> str:
    if not value:
        return fallback
    try:
        return normalize_currency(value)
    except ValueError:
        return fallback


def convert_amount_safe(
    amount: Decimal | float | int | str,
    source_currency: str,
    target_currency: str,
) -> Decimal:
    try:
        return convert_amount(
            amount,
            source_currency,
            target_currency,
            rate_provider=FX_PROVIDER,
        )
    except ValueError:
        return coerce_decimal(amount)


def sum_converted_amounts(
    amounts_by_currency: dict[str, Decimal], target_currency: str
) -> tuple[Decimal, list[str]]:
    total = Decimal("0")
    currencies: set[str] = set()
    for currency, amount in amounts_by_currency.items():
        normalized_currency = safe_normalize_currency(currency, target_currency)
        currencies.add(normalized_currency)
        total += convert_amount_safe(amount, normalized_currency, target_currency)
    return total, sorted(currencies)


def fetch_totals_by_currency(
    user_id: int, start_date: date, end_date: date, txn_type: str
) -> dict[str, Decimal]:
    total_expr = func.coalesce(func.sum(transactions.c.amount), 0).label("total")
    stmt = (
        select(transactions.c.currency, total_expr)
        .where(
            transactions.c.user_id == user_id,
            transactions.c.type == txn_type,
            transactions.c.date >= start_date,
            transactions.c.date <= end_date,
        )
        .group_by(transactions.c.currency)
    )
    with engine.begin() as conn:
        rows = conn.execute(stmt).mappings().all()
    return {
        row["currency"]: coerce_decimal(row["total"])
        for row in rows
        if row["currency"] is not None
    }


def fetch_expense_group_totals(
    user_id: int, start_date: date, end_date: date, home_currency: str
) -> tuple[dict[str, Decimal], dict[str, list[str]]]:
    group_expr = categories.c.group.label("group")
    total_spent_expr = func.coalesce(func.sum(transactions.c.amount), 0).label("total_spent")
    stmt = (
        select(group_expr, transactions.c.currency, total_spent_expr)
        .select_from(
            transactions.join(
                categories,
                (transactions.c.user_id == categories.c.user_id)
                & (transactions.c.category == categories.c.name),
            )
        )
        .where(
            transactions.c.user_id == user_id,
            transactions.c.type == "expense",
            transactions.c.date >= start_date,
            transactions.c.date <= end_date,
            categories.c.group.isnot(None),
        )
        .group_by(group_expr, transactions.c.currency)
    )
    with engine.begin() as conn:
        rows = conn.execute(stmt).mappings().all()

    totals_by_group: dict[str, dict[str, Decimal]] = {
        "needs": {},
        "wants": {},
        "investments": {},
    }
    source_currencies: dict[str, set[str]] = {
        "needs": set(),
        "wants": set(),
        "investments": set(),
    }
    for row in rows:
        group = row["group"]
        if group not in totals_by_group:
            continue
        currency = safe_normalize_currency(row["currency"], home_currency)
        total_decimal = coerce_decimal(row["total_spent"])
        totals_by_group[group][currency] = total_decimal
        source_currencies[group].add(currency)

    totals: dict[str, Decimal] = {}
    source_currency_lists: dict[str, list[str]] = {}
    for group, totals_by_currency in totals_by_group.items():
        group_total, _ = sum_converted_amounts(totals_by_currency, home_currency)
        totals[group] = group_total
        source_currency_lists[group] = sorted(source_currencies[group])

    return totals, source_currency_lists


def fetch_income_total(user_id: int, start_date: date, end_date: date) -> Decimal:
    total_income_expr = func.coalesce(func.sum(transactions.c.amount), 0)
    stmt = select(total_income_expr).where(
        transactions.c.user_id == user_id,
        transactions.c.type == "income",
        transactions.c.date >= start_date,
        transactions.c.date <= end_date,
    )
    with engine.begin() as conn:
        total_value = conn.execute(stmt).scalar_one()
    return total_value if isinstance(total_value, Decimal) else Decimal(str(total_value))


def fetch_expense_total(user_id: int, start_date: date, end_date: date) -> Decimal:
    total_expense_expr = func.coalesce(func.sum(transactions.c.amount), 0)
    stmt = select(total_expense_expr).where(
        transactions.c.user_id == user_id,
        transactions.c.type == "expense",
        transactions.c.date >= start_date,
        transactions.c.date <= end_date,
    )
    with engine.begin() as conn:
        total_value = conn.execute(stmt).scalar_one()
    return total_value if isinstance(total_value, Decimal) else Decimal(str(total_value))


def fetch_transaction_count(user_id: int, start_date: date, end_date: date) -> int:
    total_count_expr = func.count()
    stmt = select(total_count_expr).where(
        transactions.c.user_id == user_id,
        transactions.c.type.in_(("income", "expense")),
        transactions.c.date >= start_date,
        transactions.c.date <= end_date,
    )
    with engine.begin() as conn:
        total_value = conn.execute(stmt).scalar_one()
    return int(total_value or 0)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/auth/signup", response_model=UserResponse)
def signup(payload: CredentialsPayload) -> UserResponse:
    email = payload.email.strip().lower()
    if not email or not payload.password:
        raise HTTPException(status_code=400, detail="Email and password required.")
    hashed_password = hash_password(payload.password)

    stmt = (
        insert(users)
        .values(email=email, hashed_password=hashed_password)
        .returning(users.c.id, users.c.email, users.c.created_at)
    )
    try:
        with engine.begin() as conn:
            result = conn.execute(stmt)
            row = result.mappings().first()
            if row:
                ensure_default_categories(conn, row["id"])
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Email already exists.") from exc

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create user.")
    return UserResponse(id=row["id"], email=row["email"], created_at=row["created_at"])


@app.post("/auth/login", response_model=UserResponse)
def login(payload: CredentialsPayload) -> UserResponse:
    email = payload.email.strip().lower()
    with engine.begin() as conn:
        result = conn.execute(select(users).where(users.c.email == email))
        row = result.mappings().first()

    if not row or not verify_password(payload.password, row["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    return UserResponse(id=row["id"], email=row["email"], created_at=row["created_at"])


@app.get("/users/me/settings", response_model=UserSettingsResponse)
def get_user_settings(
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> UserSettingsResponse:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        row = conn.execute(select(users).where(users.c.id == user_id)).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
        resolved_home_currency = resolve_default_currency(conn, user_id)
        if not row["home_currency"] and resolved_home_currency:
            set_home_currency_if_missing(conn, user_id, resolved_home_currency)
    return UserSettingsResponse(
        id=row["id"],
        email=row["email"],
        home_currency=resolved_home_currency,
    )


@app.put("/users/me/settings", response_model=UserSettingsResponse)
def update_user_settings(
    payload: UserSettingsPayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> UserSettingsResponse:
    user_id = get_user_id(x_user_id)
    if payload.home_currency is None:
        raise HTTPException(status_code=400, detail="Home currency required.")
    try:
        normalized_currency = normalize_currency(payload.home_currency)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    with engine.begin() as conn:
        result = conn.execute(
            update(users)
            .where(users.c.id == user_id)
            .values(home_currency=normalized_currency)
            .returning(users.c.id, users.c.email, users.c.home_currency)
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")
    return UserSettingsResponse(
        id=row["id"],
        email=row["email"],
        home_currency=row["home_currency"],
    )


@app.get("/categories", response_model=list[CategoryResponse])
def list_categories(
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[CategoryResponse]:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        ensure_default_categories(conn, user_id)
        result = conn.execute(
            select(categories)
            .where(categories.c.user_id == user_id)
            .order_by(categories.c.name.asc(), categories.c.id.asc())
        )
        rows = result.mappings().all()
    return [
        CategoryResponse(
            id=row["id"],
            user_id=row["user_id"],
            name=row["name"],
            group=row["group"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@app.post("/categories", response_model=CategoryResponse)
def create_category(
    payload: CategoryPayload, x_user_id: str | None = Header(None, alias="x-user-id")
) -> CategoryResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = CategoryPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stmt = (
        insert(categories)
        .values(user_id=user_id, name=payload.name, group=payload.group)
        .returning(
            categories.c.id,
            categories.c.user_id,
            categories.c.name,
            categories.c.group,
            categories.c.created_at,
        )
    )
    try:
        with engine.begin() as conn:
            result = conn.execute(stmt)
            row = result.mappings().first()
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Category already exists.") from exc

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create category.")
    return CategoryResponse(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        group=row["group"],
        created_at=row["created_at"],
    )


@app.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    payload: CategoryPayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> CategoryResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = CategoryPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stmt = (
        update(categories)
        .where(categories.c.id == category_id, categories.c.user_id == user_id)
        .values(name=payload.name, group=payload.group)
        .returning(
            categories.c.id,
            categories.c.user_id,
            categories.c.name,
            categories.c.group,
            categories.c.created_at,
        )
    )
    try:
        with engine.begin() as conn:
            result = conn.execute(stmt)
            row = result.mappings().first()
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Category already exists.") from exc

    if not row:
        raise HTTPException(status_code=404, detail="Category not found.")
    return CategoryResponse(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        group=row["group"],
        created_at=row["created_at"],
    )


@app.delete("/categories/{category_id}")
def delete_category(
    category_id: int, x_user_id: str | None = Header(None, alias="x-user-id")
) -> dict:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        result = conn.execute(
            select(categories.c.id, categories.c.name).where(
                categories.c.id == category_id, categories.c.user_id == user_id
            )
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Category not found.")
        if category_in_use(conn, user_id, row["name"]):
            raise HTTPException(status_code=409, detail="Category is in use.")
        delete_stmt = categories.delete().where(
            categories.c.id == category_id, categories.c.user_id == user_id
        )
        conn.execute(delete_stmt)
    return {"status": "deleted"}


@app.get("/accounts", response_model=list[AccountResponse])
def list_accounts(x_user_id: str | None = Header(None, alias="x-user-id")) -> list[AccountResponse]:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        result = conn.execute(
            select(accounts).where(accounts.c.user_id == user_id).order_by(accounts.c.created_at.desc())
        )
        rows = result.mappings().all()
    return [
        AccountResponse(
            id=row["id"],
            user_id=row["user_id"],
            name=row["name"],
            type=row["type"],
            institution=row["institution"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@app.post("/accounts", response_model=AccountResponse)
def create_account(
    payload: AccountPayload, x_user_id: str | None = Header(None, alias="x-user-id")
) -> AccountResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = AccountPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stmt = (
        insert(accounts)
        .values(
            user_id=user_id,
            name=payload.name,
            type=payload.type,
            institution=payload.institution,
        )
        .returning(
            accounts.c.id,
            accounts.c.user_id,
            accounts.c.name,
            accounts.c.type,
            accounts.c.institution,
            accounts.c.created_at,
        )
    )
    with engine.begin() as conn:
        result = conn.execute(stmt)
        row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create account.")
    return AccountResponse(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        type=row["type"],
        institution=row["institution"],
        created_at=row["created_at"],
    )


@app.put("/accounts/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: int, payload: AccountPayload, x_user_id: str | None = Header(None, alias="x-user-id")
) -> AccountResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = AccountPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stmt = (
        update(accounts)
        .where(accounts.c.id == account_id, accounts.c.user_id == user_id)
        .values(name=payload.name, type=payload.type, institution=payload.institution)
        .returning(
            accounts.c.id,
            accounts.c.user_id,
            accounts.c.name,
            accounts.c.type,
            accounts.c.institution,
            accounts.c.created_at,
        )
    )
    with engine.begin() as conn:
        result = conn.execute(stmt)
        row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Account not found.")
    return AccountResponse(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        type=row["type"],
        institution=row["institution"],
        created_at=row["created_at"],
    )


@app.delete("/accounts/{account_id}")
def delete_account(account_id: int, x_user_id: str | None = Header(None, alias="x-user-id")) -> dict:
    user_id = get_user_id(x_user_id)
    stmt = accounts.delete().where(accounts.c.id == account_id, accounts.c.user_id == user_id)
    with engine.begin() as conn:
        result = conn.execute(stmt)
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Account not found.")
    return {"status": "deleted"}


@app.get("/investments", response_model=list[InvestmentResponse])
def list_investments(
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[InvestmentResponse]:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        result = conn.execute(
            select(investments).where(investments.c.user_id == user_id).order_by(investments.c.created_at.desc())
        )
        rows = result.mappings().all()
    return [
        InvestmentResponse(
            id=row["id"],
            user_id=row["user_id"],
            name=row["name"],
            symbol=row["symbol"],
            asset_type=row["asset_type"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@app.get("/investments/positions", response_model=list[InvestmentPositionResponse])
def list_investment_positions(
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[InvestmentPositionResponse]:
    user_id = get_user_id(x_user_id)
    currency_subquery = (
        select(func.coalesce(investment_entries.c.currency, transactions.c.currency))
        .select_from(
            investment_entries.join(
                transactions,
                (investment_entries.c.transaction_id == transactions.c.id)
                & (investment_entries.c.user_id == transactions.c.user_id),
            )
        )
        .where(
            investment_entries.c.user_id == user_id,
            investment_entries.c.investment_id == investments.c.id,
        )
        .order_by(investment_entries.c.date.desc(), investment_entries.c.id.desc())
        .limit(1)
        .scalar_subquery()
    )
    stmt = (
        select(
            investments.c.id,
            investments.c.name,
            investments.c.symbol,
            investments.c.total_shares,
            investments.c.average_cost_per_share,
            investments.c.total_cost_basis,
            currency_subquery.label("currency"),
        )
        .where(
            investments.c.user_id == user_id,
            investments.c.total_shares > 0,
        )
        .order_by(investments.c.created_at.desc())
    )
    with engine.begin() as conn:
        rows = conn.execute(stmt).mappings().all()
    return [
        InvestmentPositionResponse(
            id=row["id"],
            name=row["name"],
            symbol=row["symbol"],
            total_shares=row["total_shares"],
            average_cost_per_share=row["average_cost_per_share"],
            total_cost_basis=row["total_cost_basis"],
            currency=row["currency"],
        )
        for row in rows
    ]


@app.get("/investments/activity", response_model=list[InvestmentActivityResponse])
def list_investment_activity(
    investment_id: int | None = None,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[InvestmentActivityResponse]:
    user_id = get_user_id(x_user_id)
    conditions = [investment_entries.c.user_id == user_id]
    if investment_id is not None:
        conditions.append(investment_entries.c.investment_id == investment_id)
    stmt = (
        select(
            investment_entries.c.id,
            investment_entries.c.investment_id,
            investment_entries.c.transaction_id,
            investment_entries.c.quantity,
            investment_entries.c.price,
            investment_entries.c.price_per_share,
            investment_entries.c.total_amount,
            investment_entries.c.currency,
            investment_entries.c.realized_profit_loss,
            transactions.c.amount.label("transaction_amount"),
            transactions.c.currency.label("transaction_currency"),
            investment_entries.c.type,
            investment_entries.c.date,
            investments.c.name.label("investment_name"),
            investments.c.symbol.label("investment_symbol"),
        )
        .select_from(
            investment_entries.join(
                investments, investment_entries.c.investment_id == investments.c.id
            ).join(
                transactions,
                (investment_entries.c.transaction_id == transactions.c.id)
                & (investment_entries.c.user_id == transactions.c.user_id),
            )
        )
        .where(*conditions)
        .order_by(investment_entries.c.date.desc(), investment_entries.c.id.desc())
    )
    with engine.begin() as conn:
        rows = conn.execute(stmt).mappings().all()
    return [
        InvestmentActivityResponse(
            id=row["id"],
            investment_id=row["investment_id"],
            investment_name=row["investment_name"],
            investment_symbol=row["investment_symbol"],
            transaction_id=row["transaction_id"],
            type=row["type"],
            quantity=row["quantity"],
            price=row["price"],
            price_per_share=row["price_per_share"] or row["price"],
            total_amount=row["total_amount"] or row["transaction_amount"],
            currency=row["currency"] or row["transaction_currency"],
            realized_profit_loss=row["realized_profit_loss"],
            date=row["date"],
        )
        for row in rows
    ]


@app.get("/investments/realized", response_model=list[InvestmentRealizedResponse])
def list_realized_investments(
    investment_id: int | None = None,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[InvestmentRealizedResponse]:
    user_id = get_user_id(x_user_id)
    conditions = [investment_entries.c.user_id == user_id, investment_entries.c.type == "sell"]
    if investment_id is not None:
        conditions.append(investment_entries.c.investment_id == investment_id)
    stmt = (
        select(
            investment_entries.c.id,
            investment_entries.c.investment_id,
            investment_entries.c.quantity,
            investment_entries.c.price,
            investment_entries.c.price_per_share,
            investment_entries.c.total_amount,
            investment_entries.c.currency,
            investment_entries.c.cost_of_sold_shares,
            investment_entries.c.realized_profit_loss,
            investment_entries.c.date,
            transactions.c.amount.label("transaction_amount"),
            transactions.c.currency.label("transaction_currency"),
            transactions.c.converted_at,
            investments.c.name.label("investment_name"),
            investments.c.symbol.label("investment_symbol"),
        )
        .select_from(
            investment_entries.join(
                investments, investment_entries.c.investment_id == investments.c.id
            ).join(
                transactions,
                (investment_entries.c.transaction_id == transactions.c.id)
                & (investment_entries.c.user_id == transactions.c.user_id),
            )
        )
        .where(*conditions)
        .order_by(investment_entries.c.date.desc(), investment_entries.c.id.desc())
    )
    with engine.begin() as conn:
        rows = conn.execute(stmt).mappings().all()

    responses: list[InvestmentRealizedResponse] = []
    for row in rows:
        quantity = row["quantity"]
        total_proceeds = row["total_amount"] or row["transaction_amount"]
        cost_basis = row["cost_of_sold_shares"]
        if cost_basis is None and total_proceeds is not None and row["realized_profit_loss"] is not None:
            cost_basis = total_proceeds - row["realized_profit_loss"]
        average_buy_price = None
        if quantity and cost_basis is not None:
            average_buy_price = cost_basis / quantity
        responses.append(
            InvestmentRealizedResponse(
                id=row["id"],
                investment_id=row["investment_id"],
                investment_name=row["investment_name"],
                investment_symbol=row["investment_symbol"],
                quantity_sold=quantity,
                average_buy_price=average_buy_price,
                sell_price_per_share=row["price_per_share"] or row["price"],
                total_proceeds=total_proceeds,
                realized_profit_loss=row["realized_profit_loss"],
                currency=row["currency"] or row["transaction_currency"],
                sell_date=row["date"],
                converted_at=row["converted_at"],
            )
        )
    return responses


@app.post("/investments", response_model=InvestmentResponse)
def create_investment(
    payload: InvestmentPayload, x_user_id: str | None = Header(None, alias="x-user-id")
) -> InvestmentResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = InvestmentPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stmt = (
        insert(investments)
        .values(
            user_id=user_id,
            name=payload.name,
            symbol=payload.symbol,
            asset_type=payload.asset_type,
        )
        .returning(
            investments.c.id,
            investments.c.user_id,
            investments.c.name,
            investments.c.symbol,
            investments.c.asset_type,
            investments.c.created_at,
        )
    )
    with engine.begin() as conn:
        result = conn.execute(stmt)
        row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create investment.")
    return InvestmentResponse(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        symbol=row["symbol"],
        asset_type=row["asset_type"],
        created_at=row["created_at"],
    )


@app.put("/investments/{investment_id}", response_model=InvestmentResponse)
def update_investment(
    investment_id: int, payload: InvestmentPayload, x_user_id: str | None = Header(None, alias="x-user-id")
) -> InvestmentResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = InvestmentPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stmt = (
        update(investments)
        .where(investments.c.id == investment_id, investments.c.user_id == user_id)
        .values(name=payload.name, symbol=payload.symbol, asset_type=payload.asset_type)
        .returning(
            investments.c.id,
            investments.c.user_id,
            investments.c.name,
            investments.c.symbol,
            investments.c.asset_type,
            investments.c.created_at,
        )
    )
    with engine.begin() as conn:
        result = conn.execute(stmt)
        row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Investment not found.")
    return InvestmentResponse(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        symbol=row["symbol"],
        asset_type=row["asset_type"],
        created_at=row["created_at"],
    )


@app.delete("/investments/{investment_id}")
def delete_investment(investment_id: int, x_user_id: str | None = Header(None, alias="x-user-id")) -> dict:
    user_id = get_user_id(x_user_id)
    stmt = investments.delete().where(investments.c.id == investment_id, investments.c.user_id == user_id)
    with engine.begin() as conn:
        result = conn.execute(stmt)
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Investment not found.")
    return {"status": "deleted"}


@app.get("/espp-periods", response_model=list[EsppPeriodResponse])
def list_espp_periods(
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[EsppPeriodResponse]:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        rows = conn.execute(
            select(espp_periods)
            .where(espp_periods.c.user_id == user_id)
            .order_by(espp_periods.c.created_at.desc(), espp_periods.c.id.desc())
        ).mappings().all()
    return [
        EsppPeriodResponse(
            id=row["id"],
            user_id=row["user_id"],
            name=row["name"],
            stock_ticker=row["stock_ticker"],
            stock_currency=row["stock_currency"],
            start_date=row["start_date"],
            status=row["status"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@app.get("/espp-periods/{period_id}", response_model=EsppPeriodResponse)
def get_espp_period(
    period_id: int, x_user_id: str | None = Header(None, alias="x-user-id")
) -> EsppPeriodResponse:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        row = conn.execute(
            select(espp_periods).where(espp_periods.c.id == period_id, espp_periods.c.user_id == user_id)
        ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="ESPP period not found.")
    return EsppPeriodResponse(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        stock_ticker=row["stock_ticker"],
        stock_currency=row["stock_currency"],
        start_date=row["start_date"],
        status=row["status"],
        created_at=row["created_at"],
    )


@app.get("/espp-periods/{period_id}/closure", response_model=EsppSummaryResponse)
def get_espp_closure_summary(
    period_id: int, x_user_id: str | None = Header(None, alias="x-user-id")
) -> EsppSummaryResponse:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        period_row = conn.execute(
            select(espp_periods.c.status).where(
                espp_periods.c.id == period_id, espp_periods.c.user_id == user_id
            )
        ).first()
        if not period_row:
            raise HTTPException(status_code=404, detail="ESPP period not found.")
        if period_row[0] != "closed":
            raise HTTPException(status_code=400, detail="ESPP period must be closed.")
        closure_row = conn.execute(
            select(espp_closure).where(espp_closure.c.espp_period_id == period_id)
        ).mappings().first()
    if not closure_row:
        raise HTTPException(
            status_code=404, detail="ESPP close summary unavailable."
        )
    return EsppSummaryResponse(
        open_fmv=closure_row["open_fmv"],
        close_fmv=closure_row["close_fmv"],
        exchange_rate=closure_row["exchange_rate"],
        min_fmv=closure_row["min_fmv"],
        purchase_price=closure_row["purchase_price"],
        total_invested_home=closure_row["total_invested_home"],
        total_invested_stock_currency=closure_row["total_invested_stock_currency"],
        shares_purchased=closure_row["shares_purchased"],
        taxes_paid=closure_row["taxes_paid"],
        shares_withheld=closure_row["shares_withheld"],
        shares_left=closure_row["shares_left"],
        paid_with_shares=closure_row["paid_with_shares"],
        refunded_from_taxes=closure_row["refunded_from_taxes"],
        unused_for_shares=closure_row["unused_for_shares"],
        total_refunded=closure_row["total_refunded"],
    )


@app.post("/espp-periods/{period_id}/summary", response_model=EsppSummaryResponse)
def preview_espp_summary(
    period_id: int,
    payload: EsppSummaryPayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> EsppSummaryResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = EsppSummaryPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    with engine.begin() as conn:
        period_row = conn.execute(
            select(espp_periods.c.status).where(
                espp_periods.c.id == period_id, espp_periods.c.user_id == user_id
            )
        ).first()
        if not period_row:
            raise HTTPException(status_code=404, detail="ESPP period not found.")
        if period_row[0] != "open":
            raise HTTPException(status_code=400, detail="ESPP period must be open.")
        total_invested_home = conn.execute(
            select(func.coalesce(func.sum(espp_deposits.c.amount_home_currency), 0))
            .where(espp_deposits.c.espp_period_id == period_id)
        ).scalar_one()
        stored_open_fmv = None
        if payload.open_fmv is not None:
            normalized_open_fmv = payload.open_fmv.quantize(ESPP_PRICE_QUANT)
            existing = conn.execute(
                select(espp_closure.c.espp_period_id).where(
                    espp_closure.c.espp_period_id == period_id
                )
            ).first()
            if existing:
                conn.execute(
                    update(espp_closure)
                    .where(espp_closure.c.espp_period_id == period_id)
                    .values(open_fmv=normalized_open_fmv)
                )
            else:
                conn.execute(
                    insert(espp_closure).values(
                        espp_period_id=period_id, open_fmv=normalized_open_fmv
                    )
                )
            stored_open_fmv = normalized_open_fmv
        else:
            stored_open_fmv = conn.execute(
                select(espp_closure.c.open_fmv).where(
                    espp_closure.c.espp_period_id == period_id
                )
            ).scalar_one_or_none()
    return compute_espp_summary(
        Decimal(total_invested_home),
        payload.open_fmv if payload.open_fmv is not None else stored_open_fmv,
        payload.close_fmv,
        payload.exchange_rate,
    )


@app.post("/espp-periods/{period_id}/open-fmv", response_model=EsppOpenFmvResponse)
def save_espp_open_fmv(
    period_id: int,
    payload: EsppOpenFmvPayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> EsppOpenFmvResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = EsppOpenFmvPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    with engine.begin() as conn:
        period_row = conn.execute(
            select(espp_periods.c.status).where(
                espp_periods.c.id == period_id, espp_periods.c.user_id == user_id
            )
        ).first()
        if not period_row:
            raise HTTPException(status_code=404, detail="ESPP period not found.")
        if period_row[0] != "open":
            raise HTTPException(status_code=400, detail="ESPP period must be open.")
        normalized_open_fmv = (
            payload.open_fmv.quantize(ESPP_PRICE_QUANT)
            if payload.open_fmv is not None
            else None
        )
        existing = conn.execute(
            select(espp_closure.c.espp_period_id).where(
                espp_closure.c.espp_period_id == period_id
            )
        ).first()
        if existing:
            conn.execute(
                update(espp_closure)
                .where(espp_closure.c.espp_period_id == period_id)
                .values(open_fmv=normalized_open_fmv)
            )
        elif normalized_open_fmv is not None:
            conn.execute(
                insert(espp_closure).values(
                    espp_period_id=period_id, open_fmv=normalized_open_fmv
                )
            )
    return EsppOpenFmvResponse(open_fmv=normalized_open_fmv)


@app.post("/espp-periods/{period_id}/close", response_model=EsppCloseResponse)
def close_espp_period(
    period_id: int,
    payload: EsppClosePayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> EsppCloseResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = EsppClosePayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        period_row = conn.execute(
            select(
                espp_periods.c.id,
                espp_periods.c.status,
                espp_periods.c.stock_ticker,
                espp_periods.c.stock_currency,
            ).where(espp_periods.c.id == period_id, espp_periods.c.user_id == user_id)
        ).mappings().first()
        if not period_row:
            raise HTTPException(status_code=404, detail="ESPP period not found.")
        if period_row["status"] != "open":
            raise HTTPException(status_code=400, detail="ESPP period must be open.")
        account_exists = conn.execute(
            select(accounts.c.id).where(
                accounts.c.id == payload.account_id, accounts.c.user_id == user_id
            )
        ).first()
        if not account_exists:
            raise HTTPException(status_code=404, detail="Account not found.")
        ensure_espp_deposit_count(conn, period_id)
        total_invested_home = conn.execute(
            select(func.coalesce(func.sum(espp_deposits.c.amount_home_currency), 0))
            .where(espp_deposits.c.espp_period_id == period_id)
        ).scalar_one()
        summary = compute_espp_summary(
            Decimal(total_invested_home),
            payload.open_fmv,
            payload.close_fmv,
            payload.exchange_rate,
        )
        if summary.shares_left is None or summary.close_fmv is None:
            raise HTTPException(
                status_code=400,
                detail="ESPP summary is incomplete.",
            )
        if summary.shares_left <= 0:
            raise HTTPException(
                status_code=400,
                detail="ESPP shares must be greater than zero.",
            )
        last_deposit_date = conn.execute(
            select(func.max(espp_deposits.c.date)).where(
                espp_deposits.c.espp_period_id == period_id
            )
        ).scalar_one_or_none()
        if last_deposit_date is None:
            raise HTTPException(status_code=400, detail="ESPP deposits are incomplete.")

        category_name = "ESPP"
        category_exists = conn.execute(
            select(categories.c.id).where(
                categories.c.user_id == user_id, categories.c.name == category_name
            )
        ).mappings().first()
        if not category_exists:
            conn.execute(
                insert(categories).values(
                    user_id=user_id,
                    name=category_name,
                    group="investments",
                )
            )

        investment_name = f"ESPP ({period_row['stock_ticker']})"
        investment_row = conn.execute(
            select(investments.c.id).where(
                investments.c.user_id == user_id, investments.c.name == investment_name
            )
        ).mappings().first()
        if not investment_row:
            investment_row = conn.execute(
                insert(investments)
                .values(
                    user_id=user_id,
                    name=investment_name,
                    symbol=period_row["stock_ticker"],
                    asset_type="stock",
                )
                .returning(investments.c.id)
            ).mappings().first()
        if not investment_row:
            raise HTTPException(status_code=500, detail="Failed to create investment.")
        investment_id = investment_row["id"]

        total_amount = (summary.shares_left * summary.close_fmv).quantize(ESPP_MONEY_QUANT)
        txn_row = conn.execute(
            insert(transactions)
            .values(
                user_id=user_id,
                account_id=payload.account_id,
                amount=total_amount,
                currency=period_row["stock_currency"],
                type="expense",
                category=category_name,
                date=last_deposit_date,
                notes=None,
            )
            .returning(transactions.c.id)
        ).mappings().first()
        if not txn_row:
            raise HTTPException(status_code=500, detail="Failed to create transaction.")
        transaction_id = txn_row["id"]

        conn.execute(
            insert(investment_entries).values(
                user_id=user_id,
                investment_id=investment_id,
                transaction_id=transaction_id,
                quantity=summary.shares_left,
                price=summary.close_fmv,
                price_per_share=summary.close_fmv,
                total_amount=total_amount,
                currency=period_row["stock_currency"],
                type="buy",
                date=last_deposit_date,
            )
        )
        try:
            recalculate_investment_position(conn, user_id, investment_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        closure_values = {
            "open_fmv": summary.open_fmv,
            "close_fmv": summary.close_fmv,
            "exchange_rate": summary.exchange_rate,
            "min_fmv": summary.min_fmv,
            "purchase_price": summary.purchase_price,
            "total_invested_home": summary.total_invested_home,
            "total_invested_stock_currency": summary.total_invested_stock_currency,
            "shares_purchased": summary.shares_purchased,
            "shares_withheld": summary.shares_withheld,
            "shares_left": summary.shares_left,
            "taxes_paid": summary.taxes_paid,
            "paid_with_shares": summary.paid_with_shares,
            "refunded_from_taxes": summary.refunded_from_taxes,
            "unused_for_shares": summary.unused_for_shares,
            "total_refunded": summary.total_refunded,
            "closed_at": func.now(),
        }
        existing_closure = conn.execute(
            select(espp_closure.c.espp_period_id).where(
                espp_closure.c.espp_period_id == period_id
            )
        ).first()
        if existing_closure:
            conn.execute(
                update(espp_closure)
                .where(espp_closure.c.espp_period_id == period_id)
                .values(**closure_values)
            )
        else:
            conn.execute(
                insert(espp_closure).values(
                    espp_period_id=period_id, **closure_values
                )
            )
        conn.execute(
            update(espp_periods)
            .where(espp_periods.c.id == period_id, espp_periods.c.user_id == user_id)
            .values(status="closed")
        )

    return EsppCloseResponse(
        period_id=period_id,
        status="closed",
        transaction_id=transaction_id,
        investment_id=investment_id,
        summary=summary,
    )


@app.post("/espp-periods", response_model=EsppPeriodResponse)
def create_espp_period(
    payload: EsppPeriodPayload, x_user_id: str | None = Header(None, alias="x-user-id")
) -> EsppPeriodResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = EsppPeriodPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        status = payload.status or "open"
        if status == "open":
            ensure_single_open_espp_period(conn, user_id)
        stmt = (
            insert(espp_periods)
            .values(
                user_id=user_id,
                name=payload.name,
                stock_ticker=payload.stock_ticker,
                stock_currency=payload.stock_currency,
                start_date=payload.start_date,
                status=status,
            )
            .returning(
                espp_periods.c.id,
                espp_periods.c.user_id,
                espp_periods.c.name,
                espp_periods.c.stock_ticker,
                espp_periods.c.stock_currency,
                espp_periods.c.start_date,
                espp_periods.c.status,
                espp_periods.c.created_at,
            )
        )
        row = conn.execute(stmt).mappings().first()
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create ESPP period.")
        deposit_rows = [
            {
                "espp_period_id": row["id"],
                "date": deposit_date,
                "amount_home_currency": Decimal("0.00"),
            }
            for deposit_date in build_espp_deposit_schedule(payload.start_date)
        ]
        conn.execute(insert(espp_deposits), deposit_rows)

    return EsppPeriodResponse(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        stock_ticker=row["stock_ticker"],
        stock_currency=row["stock_currency"],
        start_date=row["start_date"],
        status=row["status"],
        created_at=row["created_at"],
    )


@app.put("/espp-periods/{period_id}", response_model=EsppPeriodResponse)
def update_espp_period(
    period_id: int, payload: EsppPeriodPayload, x_user_id: str | None = Header(None, alias="x-user-id")
) -> EsppPeriodResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = EsppPeriodPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        current_status = conn.execute(
            select(espp_periods.c.status).where(
                espp_periods.c.id == period_id, espp_periods.c.user_id == user_id
            )
        ).scalar_one_or_none()
        if current_status is None:
            raise HTTPException(status_code=404, detail="ESPP period not found.")
        if current_status == "closed":
            raise HTTPException(status_code=400, detail="Closed ESPP periods cannot be modified.")
        if payload.status == "closed":
            raise HTTPException(status_code=400, detail="Use the ESPP close flow to close a period.")
        status = payload.status or current_status
        if status == "open":
            ensure_single_open_espp_period(conn, user_id, exclude_period_id=period_id)
        stmt = (
            update(espp_periods)
            .where(espp_periods.c.id == period_id, espp_periods.c.user_id == user_id)
            .values(
                name=payload.name,
                stock_ticker=payload.stock_ticker,
                stock_currency=payload.stock_currency,
                start_date=payload.start_date,
                status=status,
            )
            .returning(
                espp_periods.c.id,
                espp_periods.c.user_id,
                espp_periods.c.name,
                espp_periods.c.stock_ticker,
                espp_periods.c.stock_currency,
                espp_periods.c.start_date,
                espp_periods.c.status,
                espp_periods.c.created_at,
            )
        )
        row = conn.execute(stmt).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="ESPP period not found.")
    return EsppPeriodResponse(
        id=row["id"],
        user_id=row["user_id"],
        name=row["name"],
        stock_ticker=row["stock_ticker"],
        stock_currency=row["stock_currency"],
        start_date=row["start_date"],
        status=row["status"],
        created_at=row["created_at"],
    )


@app.delete("/espp-periods/{period_id}")
def delete_espp_period(period_id: int, x_user_id: str | None = Header(None, alias="x-user-id")) -> dict:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        existing = conn.execute(
            select(espp_periods.c.id).where(espp_periods.c.id == period_id, espp_periods.c.user_id == user_id)
        ).first()
        if not existing:
            raise HTTPException(status_code=404, detail="ESPP period not found.")
        conn.execute(espp_deposits.delete().where(espp_deposits.c.espp_period_id == period_id))
        conn.execute(espp_closure.delete().where(espp_closure.c.espp_period_id == period_id))
        conn.execute(espp_periods.delete().where(espp_periods.c.id == period_id, espp_periods.c.user_id == user_id))
    return {"status": "deleted"}


@app.get("/espp-periods/{period_id}/deposits", response_model=list[EsppDepositResponse])
def list_espp_deposits(
    period_id: int, x_user_id: str | None = Header(None, alias="x-user-id")
) -> list[EsppDepositResponse]:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        period_exists = conn.execute(
            select(espp_periods.c.id).where(espp_periods.c.id == period_id, espp_periods.c.user_id == user_id)
        ).first()
        if not period_exists:
            raise HTTPException(status_code=404, detail="ESPP period not found.")
        ensure_espp_deposit_count(conn, period_id)
        rows = conn.execute(
            select(espp_deposits)
            .where(espp_deposits.c.espp_period_id == period_id)
            .order_by(espp_deposits.c.date.asc(), espp_deposits.c.id.asc())
        ).mappings().all()
    return [
        EsppDepositResponse(
            id=row["id"],
            espp_period_id=row["espp_period_id"],
            date=row["date"],
            amount_home_currency=row["amount_home_currency"],
        )
        for row in rows
    ]


@app.get("/espp-deposits/{deposit_id}", response_model=EsppDepositResponse)
def get_espp_deposit(
    deposit_id: int, x_user_id: str | None = Header(None, alias="x-user-id")
) -> EsppDepositResponse:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        row = conn.execute(
            select(
                espp_deposits.c.id,
                espp_deposits.c.espp_period_id,
                espp_deposits.c.date,
                espp_deposits.c.amount_home_currency,
            )
            .select_from(
                espp_deposits.join(espp_periods, espp_deposits.c.espp_period_id == espp_periods.c.id)
            )
            .where(espp_deposits.c.id == deposit_id, espp_periods.c.user_id == user_id)
        ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="ESPP deposit not found.")
    return EsppDepositResponse(
        id=row["id"],
        espp_period_id=row["espp_period_id"],
        date=row["date"],
        amount_home_currency=row["amount_home_currency"],
    )


@app.post("/espp-periods/{period_id}/deposits", response_model=EsppDepositResponse)
def create_espp_deposit(
    period_id: int,
    payload: EsppDepositPayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> EsppDepositResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = EsppDepositPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        period_info = conn.execute(
            select(espp_periods.c.start_date, espp_periods.c.status).where(
                espp_periods.c.id == period_id, espp_periods.c.user_id == user_id
            )
        ).mappings().first()
        if not period_info:
            raise HTTPException(status_code=404, detail="ESPP period not found.")
        if period_info["status"] != "open":
            raise HTTPException(status_code=400, detail="Deposits are only allowed for open ESPP periods.")
        schedule = build_espp_deposit_schedule(period_info["start_date"])
        if payload.date not in schedule:
            raise HTTPException(status_code=400, detail="Deposit date must match the ESPP schedule.")
        existing = conn.execute(
            select(espp_deposits.c.id).where(
                espp_deposits.c.espp_period_id == period_id,
                espp_deposits.c.date == payload.date,
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Deposit already exists for this date.")
        count = conn.execute(
            select(func.count())
            .select_from(espp_deposits)
            .where(espp_deposits.c.espp_period_id == period_id)
        ).scalar_one()
        if count >= 13:
            raise HTTPException(status_code=400, detail="ESPP period already has 13 deposits.")
        stmt = (
            insert(espp_deposits)
            .values(
                espp_period_id=period_id,
                date=payload.date,
                amount_home_currency=payload.amount_home_currency,
            )
            .returning(
                espp_deposits.c.id,
                espp_deposits.c.espp_period_id,
                espp_deposits.c.date,
                espp_deposits.c.amount_home_currency,
            )
        )
        row = conn.execute(stmt).mappings().first()

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create ESPP deposit.")
    return EsppDepositResponse(
        id=row["id"],
        espp_period_id=row["espp_period_id"],
        date=row["date"],
        amount_home_currency=row["amount_home_currency"],
    )


@app.put("/espp-deposits/{deposit_id}", response_model=EsppDepositResponse)
def update_espp_deposit(
    deposit_id: int,
    payload: EsppDepositPayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> EsppDepositResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = EsppDepositPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        period_info = conn.execute(
            select(espp_deposits.c.espp_period_id, espp_periods.c.status, espp_deposits.c.date)
            .select_from(espp_deposits.join(espp_periods, espp_deposits.c.espp_period_id == espp_periods.c.id))
            .where(espp_deposits.c.id == deposit_id, espp_periods.c.user_id == user_id)
        ).mappings().first()
        if not period_info:
            raise HTTPException(status_code=404, detail="ESPP deposit not found.")
        if period_info["status"] != "open":
            raise HTTPException(status_code=400, detail="Deposits are only allowed for open ESPP periods.")
        ensure_espp_deposit_count(conn, period_info["espp_period_id"])
        if payload.date != period_info["date"]:
            raise HTTPException(status_code=400, detail="Deposit dates are immutable.")
        stmt = (
            update(espp_deposits)
            .where(espp_deposits.c.id == deposit_id)
            .values(
                amount_home_currency=payload.amount_home_currency,
            )
            .returning(
                espp_deposits.c.id,
                espp_deposits.c.espp_period_id,
                espp_deposits.c.date,
                espp_deposits.c.amount_home_currency,
            )
        )
        row = conn.execute(stmt).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="ESPP deposit not found.")
    return EsppDepositResponse(
        id=row["id"],
        espp_period_id=row["espp_period_id"],
        date=row["date"],
        amount_home_currency=row["amount_home_currency"],
    )


@app.delete("/espp-deposits/{deposit_id}")
def delete_espp_deposit(deposit_id: int, x_user_id: str | None = Header(None, alias="x-user-id")) -> dict:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        deposit = conn.execute(
            select(espp_deposits.c.id)
            .select_from(espp_deposits.join(espp_periods, espp_deposits.c.espp_period_id == espp_periods.c.id))
            .where(espp_deposits.c.id == deposit_id, espp_periods.c.user_id == user_id)
        ).first()
        if not deposit:
            raise HTTPException(status_code=404, detail="ESPP deposit not found.")
        conn.execute(espp_deposits.delete().where(espp_deposits.c.id == deposit_id))
    return {"status": "deleted"}


@app.get("/recurring-schedules", response_model=list[RecurringScheduleResponse])
def list_recurring_schedules(
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[RecurringScheduleResponse]:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        result = conn.execute(
            select(pay_schedules)
            .where(pay_schedules.c.user_id == user_id)
            .order_by(pay_schedules.c.created_at.desc())
        )
        rows = result.mappings().all()
    return [
        RecurringScheduleResponse(
            id=row["id"],
            user_id=row["user_id"],
            amount=row["amount"],
            currency=row["currency"],
            start_date=row["start_date"],
            account_id=row["account_id"],
            frequency=row["frequency"],
            kind=row["kind"],
            category_id=row["category_id"],
            notes=row["notes"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@app.post("/recurring-schedules", response_model=RecurringScheduleResponse)
def create_recurring_schedule(
    payload: RecurringSchedulePayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> RecurringScheduleResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = RecurringSchedulePayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        account_exists = conn.execute(
            select(accounts.c.id).where(accounts.c.id == payload.account_id, accounts.c.user_id == user_id)
        ).first()
        if not account_exists:
            raise HTTPException(status_code=404, detail="Account not found.")
        if payload.category_id is not None:
            category_exists = conn.execute(
                select(categories.c.id).where(
                    categories.c.id == payload.category_id,
                    categories.c.user_id == user_id,
                )
            ).first()
            if not category_exists:
                raise HTTPException(status_code=404, detail="Category not found.")
        try:
            resolved_currency = resolve_currency(payload.currency, conn, user_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        stmt = (
            insert(pay_schedules)
            .values(
                user_id=user_id,
                amount=payload.amount,
                currency=resolved_currency,
                kind=payload.kind,
                start_date=payload.start_date,
                account_id=payload.account_id,
                frequency=payload.frequency,
                category_id=payload.category_id,
                notes=payload.notes,
            )
            .returning(
                pay_schedules.c.id,
                pay_schedules.c.user_id,
                pay_schedules.c.amount,
                pay_schedules.c.currency,
                pay_schedules.c.kind,
                pay_schedules.c.start_date,
                pay_schedules.c.account_id,
                pay_schedules.c.frequency,
                pay_schedules.c.category_id,
                pay_schedules.c.notes,
                pay_schedules.c.created_at,
            )
        )
        row = conn.execute(stmt).mappings().first()

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create recurring schedule.")
    return RecurringScheduleResponse(
        id=row["id"],
        user_id=row["user_id"],
        amount=row["amount"],
        currency=row["currency"],
        start_date=row["start_date"],
        account_id=row["account_id"],
        frequency=row["frequency"],
        kind=row["kind"],
        category_id=row["category_id"],
        notes=row["notes"],
        created_at=row["created_at"],
    )


@app.put("/recurring-schedules/{schedule_id}", response_model=RecurringScheduleResponse)
def update_recurring_schedule(
    schedule_id: int,
    payload: RecurringSchedulePayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> RecurringScheduleResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = RecurringSchedulePayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        account_exists = conn.execute(
            select(accounts.c.id).where(accounts.c.id == payload.account_id, accounts.c.user_id == user_id)
        ).first()
        if not account_exists:
            raise HTTPException(status_code=404, detail="Account not found.")
        if payload.category_id is not None:
            category_exists = conn.execute(
                select(categories.c.id).where(
                    categories.c.id == payload.category_id,
                    categories.c.user_id == user_id,
                )
            ).first()
            if not category_exists:
                raise HTTPException(status_code=404, detail="Category not found.")
        existing_currency = None
        if payload.currency is None:
            existing_currency = conn.execute(
                select(pay_schedules.c.currency).where(
                    pay_schedules.c.id == schedule_id,
                    pay_schedules.c.user_id == user_id,
                )
            ).scalar_one_or_none()
        try:
            if payload.currency:
                resolved_currency = normalize_currency(payload.currency)
            elif existing_currency:
                try:
                    resolved_currency = normalize_currency(existing_currency)
                except ValueError:
                    resolved_currency = resolve_default_currency(conn, user_id)
            else:
                resolved_currency = resolve_default_currency(conn, user_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        stmt = (
            update(pay_schedules)
            .where(pay_schedules.c.id == schedule_id, pay_schedules.c.user_id == user_id)
            .values(
                amount=payload.amount,
                currency=resolved_currency,
                start_date=payload.start_date,
                account_id=payload.account_id,
                frequency=payload.frequency,
                kind=payload.kind,
                category_id=payload.category_id,
                notes=payload.notes,
            )
            .returning(
                pay_schedules.c.id,
                pay_schedules.c.user_id,
                pay_schedules.c.amount,
                pay_schedules.c.currency,
                pay_schedules.c.kind,
                pay_schedules.c.start_date,
                pay_schedules.c.account_id,
                pay_schedules.c.frequency,
                pay_schedules.c.category_id,
                pay_schedules.c.notes,
                pay_schedules.c.created_at,
            )
        )
        row = conn.execute(stmt).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Recurring schedule not found.")
    return RecurringScheduleResponse(
        id=row["id"],
        user_id=row["user_id"],
        amount=row["amount"],
        currency=row["currency"],
        start_date=row["start_date"],
        account_id=row["account_id"],
        frequency=row["frequency"],
        kind=row["kind"],
        category_id=row["category_id"],
        notes=row["notes"],
        created_at=row["created_at"],
    )


@app.delete("/recurring-schedules/{schedule_id}")
def delete_recurring_schedule(
    schedule_id: int, x_user_id: str | None = Header(None, alias="x-user-id")
) -> dict:
    user_id = get_user_id(x_user_id)
    stmt = pay_schedules.delete().where(
        pay_schedules.c.id == schedule_id, pay_schedules.c.user_id == user_id
    )
    with engine.begin() as conn:
        result = conn.execute(stmt)
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Recurring schedule not found.")
    return {"status": "deleted"}


@app.get("/transactions", response_model=list[TransactionResponse])
def list_transactions(
    account_id: int | None = None,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[TransactionResponse]:
    user_id = get_user_id(x_user_id)
    conditions = [transactions.c.user_id == user_id]
    if account_id is not None:
        conditions.append(transactions.c.account_id == account_id)
    join_stmt = transactions.outerjoin(
        investment_entries,
        (investment_entries.c.transaction_id == transactions.c.id)
        & (investment_entries.c.user_id == transactions.c.user_id),
    )
    with engine.begin() as conn:
        result = conn.execute(
            select(
                transactions,
                investment_entries.c.investment_id,
                investment_entries.c.quantity,
                investment_entries.c.price,
                investment_entries.c.type.label("investment_type"),
            )
            .select_from(join_stmt)
            .where(*conditions)
            .order_by(transactions.c.date.desc(), transactions.c.id.desc())
        )
        rows = result.mappings().all()
    return [
        TransactionResponse(
            id=row["id"],
            user_id=row["user_id"],
            account_id=row["account_id"],
            amount=row["amount"],
            currency=row["currency"],
            type=row["type"],
            category=row["category"],
            date=row["date"],
            notes=row["notes"],
            investment_id=row["investment_id"],
            quantity=row["quantity"],
            price=row["price"],
            investment_type=row["investment_type"],
        )
        for row in rows
    ]


@app.post("/transactions/parse-csv", response_model=CSVParseResult)
async def parse_transactions(file: UploadFile = File(...)) -> CSVParseResult:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="CSV file required.")

    contents = await file.read()
    try:
        decoded = contents.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.") from exc

    try:
        return parse_transactions_csv(decoded)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/transactions/import/preview", response_model=TransactionImportPreviewResponse)
async def preview_transaction_import(
    file: UploadFile = File(...),
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> TransactionImportPreviewResponse:
    get_user_id(x_user_id)
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="CSV file required.")

    contents = await file.read()
    try:
        decoded = contents.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded.") from exc

    try:
        parse_result = parse_transactions_csv(decoded)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    total_amount = sum((row.amount for row in parse_result.rows), Decimal("0"))
    return TransactionImportPreviewResponse(
        transactions=parse_result.rows,
        total_count=len(parse_result.rows),
        total_amount=total_amount,
    )


@app.post("/transactions/import/commit", response_model=TransactionImportCommitResponse)
def commit_transaction_import(
    payload: TransactionImportCommitPayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> TransactionImportCommitResponse:
    user_id = get_user_id(x_user_id)

    if not payload.transactions:
        raise HTTPException(status_code=400, detail="No transactions to import.")

    resolved_account_ids = {
        row.account_id if row.account_id is not None else payload.account_id
        for row in payload.transactions
    }
    if None in resolved_account_ids:
        raise HTTPException(status_code=400, detail="Account is required for import.")

    insert_rows: list[dict] = []
    for index, row in enumerate(payload.transactions, start=1):
        description = row.description.strip()
        category = row.category.strip() if row.category else ""
        notes = row.notes.strip() if row.notes else ""
        if not notes:
            notes = description
        if not description:
            raise HTTPException(
                status_code=400,
                detail=f"Row {index} is missing a description.",
            )
        if not category:
            raise HTTPException(
                status_code=400,
                detail=f"Row {index} is missing a category.",
            )
        if row.amount == 0:
            raise HTTPException(
                status_code=400,
                detail=f"Row {index} must be a non-zero amount.",
            )

        account_id = row.account_id if row.account_id is not None else payload.account_id
        txn_type = "income" if row.amount < 0 else "expense"
        amount_value = abs(row.amount)
        insert_rows.append(
            {
                "user_id": user_id,
                "account_id": account_id,
                "amount": amount_value,
                "type": txn_type,
                "category": category,
                "date": row.date,
                "notes": notes or None,
            }
        )

    with engine.begin() as conn:
        default_currency = resolve_default_currency(conn, user_id)
        set_home_currency_if_missing(conn, user_id, default_currency)
        for row in insert_rows:
            row["currency"] = default_currency
        account_rows = conn.execute(
            select(accounts.c.id).where(
                accounts.c.user_id == user_id,
                accounts.c.id.in_(resolved_account_ids),
            )
        ).scalars().all()
        if len(account_rows) != len(resolved_account_ids):
            raise HTTPException(status_code=404, detail="Account not found.")

        conn.execute(insert(transactions), insert_rows)

    return TransactionImportCommitResponse(inserted_count=len(insert_rows))


@app.post("/transactions", response_model=TransactionResponse)
def create_transaction(
    payload: TransactionPayload, x_user_id: str | None = Header(None, alias="x-user-id")
) -> TransactionResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = TransactionPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        account_exists = conn.execute(
            select(accounts.c.id).where(accounts.c.id == payload.account_id, accounts.c.user_id == user_id)
        ).first()
        if not account_exists:
            raise HTTPException(status_code=404, detail="Account not found.")
        category_group = get_category_group(conn, user_id, payload.category)
        try:
            resolved_currency = resolve_currency(payload.currency, conn, user_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        set_home_currency_if_missing(conn, user_id, resolved_currency)
        investment_entry = None
        if category_group == "investments":
            try:
                investment_entry = extract_investment_entry(payload)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            if investment_entry:
                investment_exists = conn.execute(
                    select(investments.c.id).where(
                        investments.c.id == investment_entry["investment_id"],
                        investments.c.user_id == user_id,
                    )
                ).first()
                if not investment_exists:
                    raise HTTPException(status_code=404, detail="Investment not found.")

        stmt = (
            insert(transactions)
            .values(
                user_id=user_id,
                account_id=payload.account_id,
                amount=payload.amount,
                currency=resolved_currency,
                type=payload.type,
                category=payload.category,
                date=payload.date,
                notes=payload.notes,
            )
            .returning(
                transactions.c.id,
                transactions.c.user_id,
                transactions.c.account_id,
                transactions.c.amount,
                transactions.c.currency,
                transactions.c.type,
                transactions.c.category,
                transactions.c.date,
                transactions.c.notes,
            )
        )
        result = conn.execute(stmt)
        row = result.mappings().first()
        if row and investment_entry:
            conn.execute(
                insert(investment_entries).values(
                    user_id=user_id,
                    investment_id=investment_entry["investment_id"],
                    transaction_id=row["id"],
                    quantity=investment_entry["quantity"],
                    price=investment_entry["price"],
                    price_per_share=investment_entry["price"],
                    total_amount=investment_entry["total_amount"],
                    currency=resolved_currency,
                    type=investment_entry["type"],
                    date=payload.date,
                )
            )
            try:
                recalculate_investment_position(conn, user_id, investment_entry["investment_id"])
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create transaction.")
    return TransactionResponse(
        id=row["id"],
        user_id=row["user_id"],
        account_id=row["account_id"],
        amount=row["amount"],
        currency=row["currency"],
        type=row["type"],
        category=row["category"],
        date=row["date"],
        notes=row["notes"],
        investment_id=investment_entry["investment_id"] if investment_entry else None,
        quantity=investment_entry["quantity"] if investment_entry else None,
        price=investment_entry["price"] if investment_entry else None,
        investment_type=investment_entry["type"] if investment_entry else None,
    )


@app.put("/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    payload: TransactionPayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> TransactionResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = TransactionPayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        account_exists = conn.execute(
            select(accounts.c.id).where(accounts.c.id == payload.account_id, accounts.c.user_id == user_id)
        ).first()
        if not account_exists:
            raise HTTPException(status_code=404, detail="Account not found.")
        existing_investment_entry = conn.execute(
            select(investment_entries.c.id).where(
                investment_entries.c.transaction_id == transaction_id,
                investment_entries.c.user_id == user_id,
            )
        ).first()
        if existing_investment_entry:
            raise HTTPException(status_code=400, detail="Investment transactions cannot be updated.")
        category_group = get_category_group(conn, user_id, payload.category)
        existing_currency = None
        if payload.currency is None:
            existing_currency = conn.execute(
                select(transactions.c.currency).where(
                    transactions.c.id == transaction_id,
                    transactions.c.user_id == user_id,
                )
            ).scalar_one_or_none()
        try:
            if payload.currency:
                resolved_currency = normalize_currency(payload.currency)
            elif existing_currency:
                try:
                    resolved_currency = normalize_currency(existing_currency)
                except ValueError:
                    resolved_currency = resolve_default_currency(conn, user_id)
            else:
                resolved_currency = resolve_default_currency(conn, user_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        investment_entry = None
        if category_group == "investments":
            try:
                investment_entry = extract_investment_entry(payload)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            if investment_entry:
                investment_exists = conn.execute(
                    select(investments.c.id).where(
                        investments.c.id == investment_entry["investment_id"],
                        investments.c.user_id == user_id,
                    )
                ).first()
                if not investment_exists:
                    raise HTTPException(status_code=404, detail="Investment not found.")

        stmt = (
            update(transactions)
            .where(transactions.c.id == transaction_id, transactions.c.user_id == user_id)
            .values(
                account_id=payload.account_id,
                amount=payload.amount,
                currency=resolved_currency,
                type=payload.type,
                category=payload.category,
                date=payload.date,
                notes=payload.notes,
            )
            .returning(
                transactions.c.id,
                transactions.c.user_id,
                transactions.c.account_id,
                transactions.c.amount,
                transactions.c.currency,
                transactions.c.type,
                transactions.c.category,
                transactions.c.date,
                transactions.c.notes,
            )
        )
        result = conn.execute(stmt)
        row = result.mappings().first()
        if row and investment_entry:
            existing_entry = conn.execute(
                select(investment_entries.c.id).where(
                    investment_entries.c.transaction_id == transaction_id,
                    investment_entries.c.user_id == user_id,
                )
            ).first()
            if existing_entry:
                conn.execute(
                    update(investment_entries)
                    .where(investment_entries.c.id == existing_entry[0])
                    .values(
                        investment_id=investment_entry["investment_id"],
                        quantity=investment_entry["quantity"],
                        price=investment_entry["price"],
                        price_per_share=investment_entry["price"],
                        total_amount=investment_entry["total_amount"],
                        currency=resolved_currency,
                        type=investment_entry["type"],
                        date=payload.date,
                    )
                )
            else:
                conn.execute(
                    insert(investment_entries).values(
                        user_id=user_id,
                        investment_id=investment_entry["investment_id"],
                        transaction_id=transaction_id,
                        quantity=investment_entry["quantity"],
                        price=investment_entry["price"],
                        price_per_share=investment_entry["price"],
                        total_amount=investment_entry["total_amount"],
                        currency=resolved_currency,
                        type=investment_entry["type"],
                        date=payload.date,
                    )
                )
            try:
                recalculate_investment_position(conn, user_id, investment_entry["investment_id"])
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return TransactionResponse(
        id=row["id"],
        user_id=row["user_id"],
        account_id=row["account_id"],
        amount=row["amount"],
        currency=row["currency"],
        type=row["type"],
        category=row["category"],
        date=row["date"],
        notes=row["notes"],
        investment_id=investment_entry["investment_id"] if investment_entry else None,
        quantity=investment_entry["quantity"] if investment_entry else None,
        price=investment_entry["price"] if investment_entry else None,
        investment_type=investment_entry["type"] if investment_entry else None,
    )


@app.delete("/transactions/{transaction_id}")
def delete_transaction(
    transaction_id: int, x_user_id: str | None = Header(None, alias="x-user-id")
) -> dict:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        investment_entry = conn.execute(
            select(investment_entries.c.id).where(
                investment_entries.c.transaction_id == transaction_id,
                investment_entries.c.user_id == user_id,
            )
        ).first()
        if investment_entry:
            raise HTTPException(status_code=400, detail="Investment transactions cannot be deleted.")
        stmt = transactions.delete().where(transactions.c.id == transaction_id, transactions.c.user_id == user_id)
        result = conn.execute(stmt)
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Transaction not found.")
    return {"status": "deleted"}


@app.post("/currency/convert-to-home", response_model=ConvertToHomeResponse)
def convert_to_home_currency(
    payload: ConvertToHomePayload, x_user_id: str | None = Header(None, alias="x-user-id")
) -> ConvertToHomeResponse:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        home_currency = resolve_default_currency(conn, user_id)
        entry_row = conn.execute(
            select(
                investment_entries.c.id,
                investment_entries.c.transaction_id,
                investment_entries.c.type,
                investment_entries.c.investment_id,
            ).where(
                investment_entries.c.id == payload.record_id,
                investment_entries.c.user_id == user_id,
            )
        ).mappings().first()

        investment_entry = entry_row
        txn_row = None
        if entry_row:
            txn_row = conn.execute(
                select(
                    transactions.c.id,
                    transactions.c.amount,
                    transactions.c.currency,
                    transactions.c.type,
                ).where(
                    transactions.c.id == entry_row["transaction_id"],
                    transactions.c.user_id == user_id,
                )
            ).mappings().first()
        if not txn_row:
            txn_row = conn.execute(
                select(transactions.c.id, transactions.c.amount, transactions.c.currency, transactions.c.type)
                .where(
                    transactions.c.id == payload.record_id,
                    transactions.c.user_id == user_id,
                )
            ).mappings().first()
            if txn_row:
                investment_entry = conn.execute(
                    select(
                        investment_entries.c.id,
                        investment_entries.c.type,
                        investment_entries.c.investment_id,
                    ).where(
                        investment_entries.c.transaction_id == txn_row["id"],
                        investment_entries.c.user_id == user_id,
                    )
                ).mappings().first()
        if not txn_row:
            raise HTTPException(status_code=404, detail="Record not found.")
        if investment_entry:
            if investment_entry["type"] != "sell":
                active_shares = conn.execute(
                    select(investments.c.total_shares).where(
                        investments.c.id == investment_entry["investment_id"],
                        investments.c.user_id == user_id,
                    )
                ).scalar()
                if active_shares is not None and active_shares > Decimal("0"):
                    raise HTTPException(
                        status_code=400,
                        detail="Active investment positions cannot be converted.",
                    )
                raise HTTPException(
                    status_code=400,
                    detail="Investment buy transactions cannot be converted.",
                )
        elif txn_row["type"] == "investment":
            raise HTTPException(status_code=400, detail="Investment transactions cannot be converted.")

        try:
            source_currency = normalize_currency(txn_row["currency"])
            target_currency = normalize_currency(home_currency)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            converted_amount = convert_amount(
                txn_row["amount"],
                source_currency,
                target_currency,
                rate_provider=FX_PROVIDER,
                date=payload.conversion_date,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        converted_amount = converted_amount.quantize(Decimal("0.01"))

        updated = conn.execute(
            update(transactions)
            .where(transactions.c.id == txn_row["id"], transactions.c.user_id == user_id)
            .values(
                amount=converted_amount,
                currency=target_currency,
                converted_at=payload.conversion_date,
            )
            .returning(
                transactions.c.id,
                transactions.c.amount,
                transactions.c.currency,
                transactions.c.converted_at,
            )
        ).mappings().first()

    if not updated:
        raise HTTPException(status_code=500, detail="Failed to convert currency.")

    return ConvertToHomeResponse(
        transaction_id=updated["id"],
        amount=updated["amount"],
        currency=updated["currency"],
        converted_at=updated["converted_at"],
    )


@app.get("/income/projections", response_model=list[IncomeProjectionEntry])
def income_projections(
    start_date: date = Query(...),
    end_date: date = Query(...),
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[IncomeProjectionEntry]:
    user_id = get_user_id(x_user_id)
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be on or before end date.")

    with engine.begin() as conn:
        income_rows = conn.execute(
            select(
                transactions.c.date,
                transactions.c.amount,
                transactions.c.account_id,
                transactions.c.notes,
            ).where(
                transactions.c.user_id == user_id,
                transactions.c.type == "income",
                transactions.c.date >= start_date,
                transactions.c.date <= end_date,
            )
        ).mappings().all()
        schedule_rows = conn.execute(
            select(
                pay_schedules.c.amount,
                pay_schedules.c.start_date,
                pay_schedules.c.account_id,
                pay_schedules.c.frequency,
                pay_schedules.c.notes,
            ).where(
                pay_schedules.c.user_id == user_id,
                pay_schedules.c.kind == "income",
            )
        ).mappings().all()

    actual_entries = [
        IncomeProjectionEntry(
            date=row["date"],
            amount=row["amount"],
            account_id=row["account_id"],
            source="actual",
            notes=row["notes"],
        )
        for row in income_rows
    ]

    income_by_account: dict[int, list[IncomeTransaction]] = {}
    for row in income_rows:
        income_by_account.setdefault(row["account_id"], []).append(
            IncomeTransaction(
                date=row["date"],
                amount=row["amount"],
                account_id=row["account_id"],
            )
        )

    projected_entries: list[IncomeProjectionEntry] = []
    for row in schedule_rows:
        schedule = RecurringSchedule(
            amount=row["amount"],
            start_date=row["start_date"],
            account_id=row["account_id"],
            frequency=row["frequency"],
            notes=row["notes"],
        )
        existing_income = income_by_account.get(row["account_id"], [])
        try:
            projections = project_income(schedule, start_date, end_date, existing_income)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        projected_entries.extend(
            IncomeProjectionEntry(
                date=projection.date,
                amount=projection.amount,
                account_id=projection.account_id,
                source="projected",
                notes=projection.notes,
            )
            for projection in projections
        )

    entries = actual_entries + projected_entries
    entries.sort(key=lambda entry: (entry.date, 0 if entry.source == "actual" else 1))
    return entries


@app.get("/recurring/projections", response_model=list[RecurringProjectionEntry])
def recurring_projections(
    start_date: date = Query(...),
    end_date: date = Query(...),
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[RecurringProjectionEntry]:
    user_id = get_user_id(x_user_id)
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be on or before end date.")

    with engine.begin() as conn:
        existing_rows = conn.execute(
            select(
                transactions.c.date,
                transactions.c.account_id,
                transactions.c.type,
            ).where(
                transactions.c.user_id == user_id,
                transactions.c.type.in_(("income", "expense", "investment")),
                transactions.c.date >= start_date,
                transactions.c.date <= end_date,
            )
        ).mappings().all()
        schedule_rows = conn.execute(
            select(
                pay_schedules.c.id,
                pay_schedules.c.amount,
                pay_schedules.c.start_date,
                pay_schedules.c.account_id,
                pay_schedules.c.frequency,
                pay_schedules.c.kind,
                pay_schedules.c.notes,
            ).where(pay_schedules.c.user_id == user_id)
        ).mappings().all()

    existing_transactions = [
        ActualTransaction(
            date=row["date"],
            account_id=row["account_id"],
            type=row["type"],
        )
        for row in existing_rows
    ]

    projections: list[RecurringProjectionEntry] = []
    for row in schedule_rows:
        schedule = RecurringSchedule(
            amount=row["amount"],
            start_date=row["start_date"],
            account_id=row["account_id"],
            frequency=row["frequency"],
            kind=row["kind"],
            notes=row["notes"],
        )
        try:
            schedule_projections = project_recurring_schedule(
                schedule, start_date, end_date, existing_transactions
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        projections.extend(
            RecurringProjectionEntry(
                date=projection.date,
                amount=projection.amount,
                kind=row["kind"],
                schedule_id=row["id"],
                source=projection.source,
                notes=projection.notes,
            )
            for projection in schedule_projections
        )

    projections.sort(key=lambda entry: (entry.date, entry.schedule_id))
    return projections


@app.get(
    "/reports/monthly-trends",
    response_model=list[MonthlyTrendResponse],
    response_model_exclude_none=True,
)
def monthly_trends(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[MonthlyTrendResponse]:
    user_id = get_user_id(x_user_id)
    today = date.today()
    if end_date is None:
        end_date = today
    if start_date is None:
        start_date = shift_month(month_start(today), -11)
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be on or before end date.")

    with engine.begin() as conn:
        home_currency = resolve_default_currency(conn, user_id)
        rows = conn.execute(
            select(
                transactions.c.date,
                transactions.c.amount,
                transactions.c.currency,
                transactions.c.type,
                categories.c.group.label("category_group"),
            )
            .select_from(
                transactions.outerjoin(
                    categories,
                    (transactions.c.user_id == categories.c.user_id)
                    & (transactions.c.category == categories.c.name),
                )
            )
            .where(
                transactions.c.user_id == user_id,
                transactions.c.date >= start_date,
                transactions.c.date <= end_date,
            )
        ).mappings().all()

    totals_by_month: dict[str, dict[str, object]] = {}
    for row in rows:
        month_key = row["date"].strftime("%Y-%m")
        entry = totals_by_month.setdefault(
            month_key,
            {
                "income": {},
                "regular_expenses": {},
                "investment_expenses": {},
                "source_currencies": set(),
            },
        )
        currency = safe_normalize_currency(row["currency"], home_currency)
        entry["source_currencies"].add(currency)
        amount = coerce_decimal(row["amount"])
        txn_type = row["type"].strip().lower()
        if txn_type == "income":
            entry["income"][currency] = entry["income"].get(currency, Decimal("0")) + amount
        elif txn_type == "expense":
            category_group = row["category_group"]
            if category_group and category_group.strip().lower() == "investments":
                entry["investment_expenses"][currency] = (
                    entry["investment_expenses"].get(currency, Decimal("0")) + amount
                )
            else:
                entry["regular_expenses"][currency] = (
                    entry["regular_expenses"].get(currency, Decimal("0")) + amount
                )

    projected_totals_by_month: dict[str, dict[str, Decimal]] = {}
    projected_current_month_by_month: dict[str, dict[str, Decimal]] = {}
    projected_source_currencies_by_month: dict[str, set[str]] = {}
    projected_current_source_currencies_by_month: dict[str, set[str]] = {}
    next_month_start = shift_month(month_start(today), 1)
    next_month_end = month_end(next_month_start)
    current_month_start = month_start(today)
    current_month_end = month_end(current_month_start)

    def projected_totals_for_range(
        range_start: date, range_end: date
    ) -> tuple[dict[str, Decimal], set[str]]:
        with engine.begin() as conn:
            schedule_rows = conn.execute(
                select(
                    pay_schedules.c.id,
                    pay_schedules.c.amount,
                    pay_schedules.c.currency,
                    pay_schedules.c.start_date,
                    pay_schedules.c.account_id,
                    pay_schedules.c.frequency,
                    pay_schedules.c.kind,
                    categories.c.group.label("category_group"),
                ).where(
                    pay_schedules.c.user_id == user_id,
                    pay_schedules.c.kind.in_(("income", "expense")),
                )
                .select_from(
                    pay_schedules.outerjoin(
                        categories, pay_schedules.c.category_id == categories.c.id
                    )
                )
            ).mappings().all()
        existing_transactions: list[ActualTransaction] = []

        projected_income = Decimal("0")
        projected_regular_expenses = Decimal("0")
        projected_investment_expenses = Decimal("0")
        projected_currencies: set[str] = set()
        for row in schedule_rows:
            schedule_kind = row["kind"].strip().lower()
            schedule_category_group = (
                row["category_group"].strip().lower() if row["category_group"] else None
            )
            schedule_currency = safe_normalize_currency(row["currency"], home_currency)
            schedule = RecurringSchedule(
                amount=coerce_decimal(row["amount"]),
                start_date=row["start_date"],
                account_id=row["account_id"],
                frequency=row["frequency"],
                kind=schedule_kind,
            )
            try:
                schedule_projections = project_recurring_schedule(
                    schedule,
                    range_start,
                    range_end,
                    existing_transactions,
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            for projection in schedule_projections:
                converted_amount = convert_amount_safe(
                    projection.amount, schedule_currency, home_currency
                )
                projected_currencies.add(schedule_currency)
                if projection.transaction_type == "income":
                    projected_income += converted_amount
                elif projection.transaction_type == "expense":
                    if schedule_category_group == "investments":
                        projected_investment_expenses += converted_amount
                    else:
                        projected_regular_expenses += converted_amount

        if (
            projected_income > 0
            or projected_regular_expenses > 0
            or projected_investment_expenses > 0
        ):
            return {
                "income": projected_income,
                "regular_expenses": projected_regular_expenses,
                "investment_expenses": projected_investment_expenses,
            }, projected_currencies
        return {}, set()

    if current_month_start <= end_date and current_month_end >= start_date:
        projected_current_totals, projected_current_currencies = projected_totals_for_range(
            current_month_start, current_month_end
        )
        if projected_current_totals:
            projected_current_month_by_month[current_month_start.strftime("%Y-%m")] = (
                projected_current_totals
            )
            projected_current_source_currencies_by_month[
                current_month_start.strftime("%Y-%m")
            ] = projected_current_currencies

    if next_month_start <= end_date and next_month_end >= start_date:
        projected_next_totals, projected_next_currencies = projected_totals_for_range(
            next_month_start, next_month_end
        )
        if projected_next_totals:
            projected_totals_by_month[next_month_start.strftime("%Y-%m")] = (
                projected_next_totals
            )
            projected_source_currencies_by_month[next_month_start.strftime("%Y-%m")] = (
                projected_next_currencies
            )

    results: list[MonthlyTrendResponse] = []
    for month_value in iter_months(start_date, end_date):
        key = month_value.strftime("%Y-%m")
        totals = totals_by_month.get(
            key,
            {
                "income": {},
                "regular_expenses": {},
                "investment_expenses": {},
                "source_currencies": set(),
            },
        )
        income, income_currencies = sum_converted_amounts(
            totals["income"], home_currency
        )
        regular_expenses, regular_expense_currencies = sum_converted_amounts(
            totals["regular_expenses"], home_currency
        )
        investment_expenses, investment_expense_currencies = sum_converted_amounts(
            totals["investment_expenses"], home_currency
        )
        expenses = regular_expenses + investment_expenses
        projected_totals = projected_totals_by_month.get(key, {})
        projected_income = projected_totals.get("income")
        projected_regular_expenses = projected_totals.get("regular_expenses")
        projected_investment_expenses = projected_totals.get("investment_expenses")
        projected_current_totals = projected_current_month_by_month.get(key, {})
        projected_current_income = projected_current_totals.get("income")
        projected_current_regular_expenses = projected_current_totals.get("regular_expenses")
        projected_current_investment_expenses = projected_current_totals.get(
            "investment_expenses"
        )
        projected_expenses = (
            (projected_regular_expenses or Decimal("0"))
            + (projected_investment_expenses or Decimal("0"))
        )
        projected_current_expenses = (
            (projected_current_regular_expenses or Decimal("0"))
            + (projected_current_investment_expenses or Decimal("0"))
        )
        source_currencies = set(totals["source_currencies"])
        source_currencies.update(income_currencies)
        source_currencies.update(regular_expense_currencies)
        source_currencies.update(investment_expense_currencies)
        source_currencies.update(projected_source_currencies_by_month.get(key, set()))
        source_currencies.update(
            projected_current_source_currencies_by_month.get(key, set())
        )
        results.append(
            MonthlyTrendResponse(
                month=key,
                total_income=income,
                total_expenses=expenses,
                total_regular_expenses=regular_expenses,
                total_investment_expenses=investment_expenses,
                net_cashflow=income - expenses,
                projected_total_income=projected_income if projected_income else None,
                projected_total_expenses=projected_expenses if projected_expenses else None,
                projected_total_regular_expenses=(
                    projected_regular_expenses if projected_regular_expenses else None
                ),
                projected_total_investment_expenses=(
                    projected_investment_expenses if projected_investment_expenses else None
                ),
                projected_total_income_current_month=(
                    projected_current_income if projected_current_income else None
                ),
                projected_total_expenses_current_month=(
                    projected_current_expenses if projected_current_expenses else None
                ),
                projected_total_regular_expenses_current_month=(
                    projected_current_regular_expenses
                    if projected_current_regular_expenses
                    else None
                ),
                projected_total_investment_expenses_current_month=(
                    projected_current_investment_expenses
                    if projected_current_investment_expenses
                    else None
                ),
                home_currency=home_currency,
                source_currencies=sorted(source_currencies) if source_currencies else None,
            )
        )
    return results


@app.get(
    "/reports/net-flow",
    response_model=NetFlowSummaryResponse,
)
def net_flow_summary(
    month: str | None = Query(None),
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> NetFlowSummaryResponse:
    user_id = get_user_id(x_user_id)
    month_date = date.today()
    if month:
        try:
            month_date = parse_month_value(month)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    start_date = month_start(month_date)
    end_date = month_end(month_date)
    previous_start_date = shift_month(start_date, -1)
    previous_end_date = month_end(previous_start_date)

    with engine.begin() as conn:
        home_currency = resolve_default_currency(conn, user_id)

    current_income_by_currency = fetch_totals_by_currency(
        user_id, start_date, end_date, "income"
    )
    current_expense_by_currency = fetch_totals_by_currency(
        user_id, start_date, end_date, "expense"
    )
    current_income, current_income_currencies = sum_converted_amounts(
        current_income_by_currency, home_currency
    )
    current_expenses, current_expense_currencies = sum_converted_amounts(
        current_expense_by_currency, home_currency
    )
    current_net_flow = current_income - current_expenses

    previous_income_by_currency = fetch_totals_by_currency(
        user_id, previous_start_date, previous_end_date, "income"
    )
    previous_expense_by_currency = fetch_totals_by_currency(
        user_id, previous_start_date, previous_end_date, "expense"
    )
    previous_income, previous_income_currencies = sum_converted_amounts(
        previous_income_by_currency, home_currency
    )
    previous_expenses, previous_expense_currencies = sum_converted_amounts(
        previous_expense_by_currency, home_currency
    )
    previous_net_flow = previous_income - previous_expenses
    previous_count = fetch_transaction_count(user_id, previous_start_date, previous_end_date)

    percentage_change: Decimal | None = None
    if previous_count > 0 and previous_net_flow != 0:
        percentage_change = (
            (current_net_flow - previous_net_flow) / abs(previous_net_flow)
        ) * Decimal("100")

    return NetFlowSummaryResponse(
        net_flow_current_month=current_net_flow,
        net_flow_previous_month=previous_net_flow,
        percentage_change=percentage_change,
        home_currency=home_currency,
        source_currencies_current_month=sorted(
            set(current_income_currencies + current_expense_currencies)
        )
        if current_income_currencies or current_expense_currencies
        else None,
        source_currencies_previous_month=sorted(
            set(previous_income_currencies + previous_expense_currencies)
        )
        if previous_income_currencies or previous_expense_currencies
        else None,
    )


@app.get("/reports/category-breakdown", response_model=list[CategoryBreakdownResponse])
def category_breakdown(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[CategoryBreakdownResponse]:
    user_id = get_user_id(x_user_id)
    today = date.today()
    if end_date is None:
        end_date = today
    if start_date is None:
        start_date = month_start(today)
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be on or before end date.")

    category_expr = func.coalesce(transactions.c.category, "Uncategorized").label("category")
    total_spent_expr = func.coalesce(func.sum(transactions.c.amount), 0).label("total_spent")
    stmt = (
        select(category_expr, transactions.c.currency, total_spent_expr)
        .where(
            transactions.c.user_id == user_id,
            transactions.c.type == "expense",
            transactions.c.date >= start_date,
            transactions.c.date <= end_date,
        )
        .group_by(category_expr, transactions.c.currency)
    )

    with engine.begin() as conn:
        home_currency = resolve_default_currency(conn, user_id)
        rows = conn.execute(stmt).mappings().all()

    totals_by_category: dict[str, dict[str, Decimal]] = {}
    source_currencies_by_category: dict[str, set[str]] = {}
    for row in rows:
        category = row["category"]
        currency = safe_normalize_currency(row["currency"], home_currency)
        totals_by_category.setdefault(category, {})
        totals_by_category[category][currency] = coerce_decimal(row["total_spent"])
        source_currencies_by_category.setdefault(category, set()).add(currency)

    converted_totals: dict[str, Decimal] = {}
    total_spent_converted = Decimal("0")
    for category, totals_by_currency in totals_by_category.items():
        category_total, _ = sum_converted_amounts(totals_by_currency, home_currency)
        converted_totals[category] = category_total
        total_spent_converted += category_total

    if total_spent_converted <= 0:
        return []

    results: list[CategoryBreakdownResponse] = []
    for category, total_value in sorted(
        converted_totals.items(), key=lambda item: item[1], reverse=True
    ):
        percentage = (total_value / total_spent_converted) * Decimal("100")
        results.append(
            CategoryBreakdownResponse(
                category=category,
                total_spent=total_value,
                percentage_of_total=percentage,
                home_currency=home_currency,
                source_currencies=sorted(source_currencies_by_category.get(category, set()))
                if source_currencies_by_category.get(category)
                else None,
            )
        )
    return results


@app.get(
    "/reports/monthly-expense-groups",
    response_model=MonthlyExpenseGroupResponse,
    response_model_exclude_none=True,
)
def monthly_expense_groups(
    month: str | None = Query(None),
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> MonthlyExpenseGroupResponse:
    user_id = get_user_id(x_user_id)
    month_date = date.today()
    if month:
        try:
            month_date = parse_month_value(month)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    start_date = month_start(month_date)
    end_date = month_end(month_date)

    with engine.begin() as conn:
        home_currency = resolve_default_currency(conn, user_id)
    totals, source_currencies = fetch_expense_group_totals(
        user_id, start_date, end_date, home_currency
    )
    income_by_currency = fetch_totals_by_currency(
        user_id, start_date, end_date, "income"
    )
    income_total, income_currencies = sum_converted_amounts(
        income_by_currency, home_currency
    )
    # TODO: Merge projected income/expense totals once forecast pipeline lands.
    return MonthlyExpenseGroupResponse(
        month=month_date.strftime("%Y-%m"),
        income_total=income_total,
        needs_total=totals["needs"],
        wants_total=totals["wants"],
        investments_total=totals["investments"],
        home_currency=home_currency,
        income_source_currencies=income_currencies if income_currencies else None,
        needs_source_currencies=source_currencies.get("needs"),
        wants_source_currencies=source_currencies.get("wants"),
        investments_source_currencies=source_currencies.get("investments"),
    )


@app.get(
    "/reports/expense-trends",
    response_model=ExpenseTrendResponse,
    response_model_exclude_none=True,
)
def expense_trends(
    account_id: int | None = Query(None),
    resolution: str = Query("daily"),
    timeframe: str = Query("1Y"),
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> ExpenseTrendResponse:
    user_id = get_user_id(x_user_id)
    try:
        resolution = normalize_report_resolution(resolution)
        timeframe = normalize_report_timeframe(timeframe, EXPENSE_TIMEFRAMES)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    conditions = [transactions.c.user_id == user_id, transactions.c.type == "expense"]
    if account_id is not None:
        conditions.append(transactions.c.account_id == account_id)

    with engine.begin() as conn:
        home_currency = resolve_default_currency(conn, user_id)
        max_date = conn.execute(
            select(func.max(transactions.c.date)).where(*conditions)
        ).scalar_one_or_none()
        if not max_date:
            return ExpenseTrendResponse(
                resolution=resolution,
                timeframe=timeframe,
                home_currency=home_currency,
                buckets=[],
            )
        range_start = expense_timeframe_start(max_date, timeframe)
        rows = conn.execute(
            select(transactions.c.date, transactions.c.amount, transactions.c.currency)
            .where(
                *conditions,
                transactions.c.date >= range_start,
                transactions.c.date <= max_date,
            )
            .order_by(transactions.c.date.asc())
        ).mappings().all()

    totals_by_bucket: dict[date, dict[str, object]] = {}
    for row in rows:
        bucket_start = get_report_bucket_start(row["date"], resolution)
        entry = totals_by_bucket.setdefault(
            bucket_start, {"total": Decimal("0"), "source_currencies": set()}
        )
        currency = safe_normalize_currency(row["currency"], home_currency)
        entry["source_currencies"].add(currency)
        entry["total"] += convert_amount_safe(row["amount"], currency, home_currency)

    buckets: list[ExpenseTrendBucket] = []
    cursor = get_report_bucket_start(range_start, resolution)
    end_bucket = get_report_bucket_start(max_date, resolution)
    while cursor <= end_bucket:
        entry = totals_by_bucket.get(cursor)
        buckets.append(
            ExpenseTrendBucket(
                bucket_start=cursor,
                total=entry["total"] if entry else Decimal("0"),
                source_currencies=sorted(entry["source_currencies"])
                if entry and entry["source_currencies"]
                else None,
            )
        )
        cursor = add_report_interval(cursor, resolution)

    return ExpenseTrendResponse(
        resolution=resolution,
        timeframe=timeframe,
        home_currency=home_currency,
        buckets=buckets,
    )


@app.get(
    "/reports/category-trends",
    response_model=CategoryTrendResponse,
    response_model_exclude_none=True,
)
def category_trends(
    resolution: str = Query("weekly"),
    timeframe: str = Query("3M"),
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> CategoryTrendResponse:
    user_id = get_user_id(x_user_id)
    try:
        resolution = normalize_report_resolution(resolution)
        timeframe = normalize_report_timeframe(timeframe, CATEGORY_TIMEFRAMES)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    conditions = [transactions.c.user_id == user_id, transactions.c.type == "expense"]
    category_expr = func.coalesce(transactions.c.category, "Uncategorized").label("category")

    with engine.begin() as conn:
        home_currency = resolve_default_currency(conn, user_id)
        max_date = conn.execute(
            select(func.max(transactions.c.date)).where(*conditions)
        ).scalar_one_or_none()
        if not max_date:
            return CategoryTrendResponse(
                resolution=resolution,
                timeframe=timeframe,
                home_currency=home_currency,
                buckets=[],
            )
        range_start = category_timeframe_start(max_date, timeframe)
        rows = conn.execute(
            select(
                transactions.c.date,
                transactions.c.amount,
                transactions.c.currency,
                category_expr,
            )
            .where(
                *conditions,
                transactions.c.date >= range_start,
                transactions.c.date <= max_date,
            )
            .order_by(transactions.c.date.asc())
        ).mappings().all()

    totals_by_bucket: dict[date, dict[str, object]] = {}
    for row in rows:
        bucket_start = get_report_bucket_start(row["date"], resolution)
        entry = totals_by_bucket.setdefault(
            bucket_start, {"totals": {}, "source_currencies": set()}
        )
        category = row["category"]
        currency = safe_normalize_currency(row["currency"], home_currency)
        entry["source_currencies"].add(currency)
        converted_amount = convert_amount_safe(row["amount"], currency, home_currency)
        entry["totals"][category] = entry["totals"].get(category, Decimal("0")) + converted_amount

    buckets: list[CategoryTrendBucket] = []
    cursor = get_report_bucket_start(range_start, resolution)
    end_bucket = get_report_bucket_start(max_date, resolution)
    while cursor <= end_bucket:
        entry = totals_by_bucket.get(cursor)
        buckets.append(
            CategoryTrendBucket(
                bucket_start=cursor,
                totals_by_category=entry["totals"] if entry else {},
                source_currencies=sorted(entry["source_currencies"])
                if entry and entry["source_currencies"]
                else None,
            )
        )
        cursor = add_report_interval(cursor, resolution)

    return CategoryTrendResponse(
        resolution=resolution,
        timeframe=timeframe,
        home_currency=home_currency,
        buckets=buckets,
    )


@app.get("/budget/rules", response_model=list[BudgetRuleResponse])
def list_budget_rules(
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[BudgetRuleResponse]:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        result = conn.execute(
            select(budget_rules)
            .where(budget_rules.c.user_id == user_id)
            .order_by(budget_rules.c.created_at.desc(), budget_rules.c.id.desc())
        )
        rows = result.mappings().all()
    return [
        BudgetRuleResponse(
            id=row["id"],
            user_id=row["user_id"],
            rule_type=row["rule_type"],
            amount=row["amount"],
            category=row["category"],
            account_id=row["account_id"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@app.post("/budget/rules", response_model=BudgetRuleResponse)
def create_budget_rule(
    payload: BudgetRulePayload, x_user_id: str | None = Header(None, alias="x-user-id")
) -> BudgetRuleResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = BudgetRulePayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        if payload.account_id is not None:
            account_exists = conn.execute(
                select(accounts.c.id).where(
                    accounts.c.id == payload.account_id, accounts.c.user_id == user_id
                )
            ).first()
            if not account_exists:
                raise HTTPException(status_code=404, detail="Account not found.")

        stmt = (
            insert(budget_rules)
            .values(
                user_id=user_id,
                rule_type=payload.rule_type,
                amount=payload.amount,
                category=payload.category,
                account_id=payload.account_id,
            )
            .returning(
                budget_rules.c.id,
                budget_rules.c.user_id,
                budget_rules.c.rule_type,
                budget_rules.c.amount,
                budget_rules.c.category,
                budget_rules.c.account_id,
                budget_rules.c.created_at,
            )
        )
        result = conn.execute(stmt)
        row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create budget rule.")
    return BudgetRuleResponse(
        id=row["id"],
        user_id=row["user_id"],
        rule_type=row["rule_type"],
        amount=row["amount"],
        category=row["category"],
        account_id=row["account_id"],
        created_at=row["created_at"],
    )


@app.put("/budget/rules/{rule_id}", response_model=BudgetRuleResponse)
def update_budget_rule(
    rule_id: int,
    payload: BudgetRulePayload,
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> BudgetRuleResponse:
    user_id = get_user_id(x_user_id)
    try:
        payload = BudgetRulePayload.validate_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        if payload.account_id is not None:
            account_exists = conn.execute(
                select(accounts.c.id).where(
                    accounts.c.id == payload.account_id, accounts.c.user_id == user_id
                )
            ).first()
            if not account_exists:
                raise HTTPException(status_code=404, detail="Account not found.")

        stmt = (
            update(budget_rules)
            .where(budget_rules.c.id == rule_id, budget_rules.c.user_id == user_id)
            .values(
                rule_type=payload.rule_type,
                amount=payload.amount,
                category=payload.category,
                account_id=payload.account_id,
            )
            .returning(
                budget_rules.c.id,
                budget_rules.c.user_id,
                budget_rules.c.rule_type,
                budget_rules.c.amount,
                budget_rules.c.category,
                budget_rules.c.account_id,
                budget_rules.c.created_at,
            )
        )
        result = conn.execute(stmt)
        row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Budget rule not found.")
    return BudgetRuleResponse(
        id=row["id"],
        user_id=row["user_id"],
        rule_type=row["rule_type"],
        amount=row["amount"],
        category=row["category"],
        account_id=row["account_id"],
        created_at=row["created_at"],
    )


@app.delete("/budget/rules/{rule_id}")
def delete_budget_rule(
    rule_id: int, x_user_id: str | None = Header(None, alias="x-user-id")
) -> dict:
    user_id = get_user_id(x_user_id)
    stmt = budget_rules.delete().where(
        budget_rules.c.id == rule_id, budget_rules.c.user_id == user_id
    )
    with engine.begin() as conn:
        result = conn.execute(stmt)
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Budget rule not found.")
    return {"status": "deleted"}


@app.get("/budget/evaluate", response_model=list[BudgetEvaluationResponse])
def evaluate_budget_rules(
    period: str = Query(...),
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[BudgetEvaluationResponse]:
    user_id = get_user_id(x_user_id)
    today = date.today()
    try:
        start_date, end_date = get_period_range(period, today)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with engine.begin() as conn:
        home_currency = resolve_default_currency(conn, user_id)
        rule_rows = conn.execute(
            select(budget_rules).where(budget_rules.c.user_id == user_id)
        ).mappings().all()
        txn_rows = conn.execute(
            select(transactions).where(
                transactions.c.user_id == user_id,
                transactions.c.date >= start_date,
                transactions.c.date <= end_date,
            )
        ).mappings().all()

    source_currencies: set[str] = set()
    txn_items = []
    for row in txn_rows:
        currency = safe_normalize_currency(row["currency"], home_currency)
        source_currencies.add(currency)
        txn_items.append(
            Transaction(
                amount=convert_amount_safe(row["amount"], currency, home_currency),
                type=row["type"],
                date=row["date"],
                category=row["category"],
                account_id=row["account_id"],
            )
        )

    evaluations: list[BudgetEvaluationResponse] = []
    for row in rule_rows:
        rule = BudgetRule(
            rule_type=row["rule_type"],
            amount=row["amount"],
            category=row["category"],
            account_id=row["account_id"],
        )
        try:
            result = evaluate_budget(txn_items, rule, start_date, end_date)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid budget rule {row['id']}: {exc}",
            ) from exc
        evaluations.append(
            BudgetEvaluationResponse(
                rule_id=row["id"],
                rule_type=row["rule_type"],
                amount=row["amount"],
                category=row["category"],
                account_id=row["account_id"],
                period=period,
                start_date=start_date,
                end_date=end_date,
                current_value=result.current_value,
                remaining=result.remaining,
                status=result.status,
                home_currency=home_currency,
                source_currencies=sorted(source_currencies) if source_currencies else None,
            )
        )
    return evaluations
