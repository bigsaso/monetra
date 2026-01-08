import os
from datetime import date, datetime, timedelta
from decimal import Decimal

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
    case,
    create_engine,
    func,
    insert,
    select,
    update,
)
from sqlalchemy.exc import IntegrityError

from backend.budget_engine import BudgetRule, Transaction, evaluate_budget
from backend.csv_parser import CSVParseResult, ParsedTransaction, parse_transactions_csv
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
    Column("type", String(20), nullable=False),
    Column("category", String(255)),
    Column("date", Date, nullable=False),
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
    Column("kind", String(20), nullable=False, server_default="income"),
    Column("frequency", String(50), nullable=False),
    Column("start_date", Date, nullable=False),
    Column("account_id", Integer, ForeignKey("accounts.id"), nullable=False),
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
    Column("price", Numeric(12, 2), nullable=False),
    Column("type", String(10), nullable=False),
    Column("date", Date, nullable=False),
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
        payload.notes = payload.notes.strip() if payload.notes else None
        if payload.amount <= 0:
            raise ValueError("Amount must be greater than zero.")
        return payload


class TransactionResponse(TransactionPayload):
    id: int
    user_id: int


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


class MonthlyTrendResponse(BaseModel):
    month: str
    total_income: Decimal
    total_expenses: Decimal
    net_cashflow: Decimal
    projected_total_income: Decimal | None = None
    projected_total_expenses: Decimal | None = None


class CategoryBreakdownResponse(BaseModel):
    category: str
    total_spent: Decimal
    percentage_of_total: Decimal


class MonthlyExpenseGroupResponse(BaseModel):
    month: str
    income_total: Decimal
    needs_total: Decimal
    wants_total: Decimal
    investments_total: Decimal
    projected_total_income: Decimal | None = None
    projected_total_expenses: Decimal | None = None


class IncomeProjectionEntry(BaseModel):
    date: date
    amount: Decimal
    account_id: int
    source: str


class RecurringProjectionEntry(BaseModel):
    date: date
    amount: Decimal
    kind: str
    schedule_id: int
    source: str


def _normalize_frequency(value: str) -> str:
    normalized = "".join(ch for ch in value.strip().lower() if ch.isalnum())
    if normalized == "byweekly":
        return "biweekly"
    return normalized


class RecurringSchedulePayload(BaseModel):
    amount: Decimal
    start_date: date
    account_id: int
    frequency: str | None = "biweekly"
    kind: str = "income"

    @classmethod
    def validate_payload(
        cls, payload: "RecurringSchedulePayload"
    ) -> "RecurringSchedulePayload":
        if payload.amount <= 0:
            raise ValueError("Recurring schedule amount must be greater than zero.")
        normalized = _normalize_frequency(payload.frequency or "biweekly")
        if normalized not in {"weekly", "biweekly", "monthly"}:
            raise ValueError("Only weekly, biweekly, or monthly schedules are supported.")
        payload.frequency = normalized
        payload.kind = RecurringScheduleKind.validate(payload.kind or "income")
        return payload


class RecurringScheduleResponse(BaseModel):
    id: int
    user_id: int
    amount: Decimal
    start_date: date
    account_id: int
    frequency: str
    kind: str
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


class InvestmentActivityResponse(BaseModel):
    id: int
    investment_id: int
    investment_name: str
    investment_symbol: str | None = None
    transaction_id: int
    type: str
    quantity: Decimal
    price: Decimal
    date: date


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
    }


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


def fetch_expense_group_totals(
    user_id: int, start_date: date, end_date: date
) -> dict[str, Decimal]:
    group_expr = categories.c.group.label("group")
    total_spent_expr = func.coalesce(func.sum(transactions.c.amount), 0).label("total_spent")
    stmt = (
        select(group_expr, total_spent_expr)
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
        .group_by(group_expr)
    )
    with engine.begin() as conn:
        rows = conn.execute(stmt).mappings().all()

    totals = {
        "needs": Decimal("0"),
        "wants": Decimal("0"),
        "investments": Decimal("0"),
    }
    for row in rows:
        group = row["group"]
        if group not in totals:
            continue
        total_value = row["total_spent"]
        total_decimal = (
            total_value if isinstance(total_value, Decimal) else Decimal(str(total_value))
        )
        totals[group] = total_decimal
    return totals


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
            investment_entries.c.type,
            investment_entries.c.date,
            investments.c.name.label("investment_name"),
            investments.c.symbol.label("investment_symbol"),
        )
        .select_from(
            investment_entries.join(
                investments, investment_entries.c.investment_id == investments.c.id
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
            date=row["date"],
        )
        for row in rows
    ]


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
            start_date=row["start_date"],
            account_id=row["account_id"],
            frequency=row["frequency"],
            kind=row["kind"],
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
        stmt = (
            insert(pay_schedules)
            .values(
                user_id=user_id,
                amount=payload.amount,
                kind=payload.kind,
                start_date=payload.start_date,
                account_id=payload.account_id,
                frequency=payload.frequency,
            )
            .returning(
                pay_schedules.c.id,
                pay_schedules.c.user_id,
                pay_schedules.c.amount,
                pay_schedules.c.kind,
                pay_schedules.c.start_date,
                pay_schedules.c.account_id,
                pay_schedules.c.frequency,
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
        start_date=row["start_date"],
        account_id=row["account_id"],
        frequency=row["frequency"],
        kind=row["kind"],
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
        stmt = (
            update(pay_schedules)
            .where(pay_schedules.c.id == schedule_id, pay_schedules.c.user_id == user_id)
            .values(
                amount=payload.amount,
                start_date=payload.start_date,
                account_id=payload.account_id,
                frequency=payload.frequency,
                kind=payload.kind,
            )
            .returning(
                pay_schedules.c.id,
                pay_schedules.c.user_id,
                pay_schedules.c.amount,
                pay_schedules.c.kind,
                pay_schedules.c.start_date,
                pay_schedules.c.account_id,
                pay_schedules.c.frequency,
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
        start_date=row["start_date"],
        account_id=row["account_id"],
        frequency=row["frequency"],
        kind=row["kind"],
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
                    type=investment_entry["type"],
                    date=payload.date,
                )
            )

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create transaction.")
    return TransactionResponse(
        id=row["id"],
        user_id=row["user_id"],
        account_id=row["account_id"],
        amount=row["amount"],
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
        category_group = get_category_group(conn, user_id, payload.category)
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
                        type=investment_entry["type"],
                        date=payload.date,
                    )
                )

    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return TransactionResponse(
        id=row["id"],
        user_id=row["user_id"],
        account_id=row["account_id"],
        amount=row["amount"],
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
    stmt = transactions.delete().where(transactions.c.id == transaction_id, transactions.c.user_id == user_id)
    with engine.begin() as conn:
        result = conn.execute(stmt)
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Transaction not found.")
    return {"status": "deleted"}


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

    month_expr = func.to_char(transactions.c.date, "YYYY-MM").label("month")
    income_sum = func.coalesce(
        func.sum(case((transactions.c.type == "income", transactions.c.amount), else_=0)),
        0,
    ).label("total_income")
    expense_sum = func.coalesce(
        func.sum(case((transactions.c.type == "expense", transactions.c.amount), else_=0)),
        0,
    ).label("total_expenses")

    stmt = (
        select(month_expr, income_sum, expense_sum)
        .where(
            transactions.c.user_id == user_id,
            transactions.c.date >= start_date,
            transactions.c.date <= end_date,
        )
        .group_by(month_expr)
        .order_by(month_expr)
    )

    with engine.begin() as conn:
        rows = conn.execute(stmt).mappings().all()

    totals_by_month = {
        row["month"]: {
            "income": row["total_income"],
            "expenses": row["total_expenses"],
        }
        for row in rows
    }
    # TODO: Merge projected totals from recurring schedules once forecast pipeline lands.

    results: list[MonthlyTrendResponse] = []
    for month_value in iter_months(start_date, end_date):
        key = month_value.strftime("%Y-%m")
        totals = totals_by_month.get(key, {"income": Decimal("0"), "expenses": Decimal("0")})
        income = totals["income"]
        expenses = totals["expenses"]
        results.append(
            MonthlyTrendResponse(
                month=key,
                total_income=income,
                total_expenses=expenses,
                net_cashflow=income - expenses,
            )
        )
    return results


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

    total_stmt = select(func.coalesce(func.sum(transactions.c.amount), 0)).where(
        transactions.c.user_id == user_id,
        transactions.c.type == "expense",
        transactions.c.date >= start_date,
        transactions.c.date <= end_date,
    )
    stmt = (
        select(category_expr, total_spent_expr)
        .where(
            transactions.c.user_id == user_id,
            transactions.c.type == "expense",
            transactions.c.date >= start_date,
            transactions.c.date <= end_date,
        )
        .group_by(category_expr)
        .order_by(total_spent_expr.desc())
    )

    with engine.begin() as conn:
        total_spent_value = conn.execute(total_stmt).scalar_one()
        rows = conn.execute(stmt).mappings().all()

    total_spent_decimal = (
        total_spent_value
        if isinstance(total_spent_value, Decimal)
        else Decimal(str(total_spent_value))
    )
    if total_spent_decimal <= 0:
        return []

    results: list[CategoryBreakdownResponse] = []
    for row in rows:
        category_total = row["total_spent"]
        category_total_decimal = (
            category_total if isinstance(category_total, Decimal) else Decimal(str(category_total))
        )
        percentage = (category_total_decimal / total_spent_decimal) * Decimal("100")
        results.append(
            CategoryBreakdownResponse(
                category=row["category"],
                total_spent=category_total_decimal,
                percentage_of_total=percentage,
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

    totals = fetch_expense_group_totals(user_id, start_date, end_date)
    income_total = fetch_income_total(user_id, start_date, end_date)
    # TODO: Merge projected income/expense totals once forecast pipeline lands.
    return MonthlyExpenseGroupResponse(
        month=month_date.strftime("%Y-%m"),
        income_total=income_total,
        needs_total=totals["needs"],
        wants_total=totals["wants"],
        investments_total=totals["investments"],
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

    txn_items = [
        Transaction(
            amount=row["amount"],
            type=row["type"],
            date=row["date"],
            category=row["category"],
            account_id=row["account_id"],
        )
        for row in txn_rows
    ]

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
            )
        )
    return evaluations
