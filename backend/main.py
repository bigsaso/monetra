import os
from datetime import date, datetime
from decimal import Decimal

import bcrypt
from fastapi import FastAPI, HTTPException, Header, Query
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
    create_engine,
    func,
    insert,
    select,
    update,
)
from sqlalchemy.exc import IntegrityError

from backend.budget_engine import BudgetRule, Transaction, evaluate_budget

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
    values = {"income", "expense"}

    @classmethod
    def validate(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in cls.values:
            raise ValueError("Invalid transaction type.")
        return normalized


class AccountType:
    values = {"checking", "credit", "investment", "savings"}

    @classmethod
    def validate(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in cls.values:
            raise ValueError("Invalid account type.")
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


def get_period_range(period: str, today: date) -> tuple[date, date]:
    normalized = period.strip().lower()
    if normalized == "monthly":
        return today.replace(day=1), today
    raise ValueError("Unsupported period. Use 'monthly'.")


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


@app.get("/transactions", response_model=list[TransactionResponse])
def list_transactions(
    x_user_id: str | None = Header(None, alias="x-user-id"),
) -> list[TransactionResponse]:
    user_id = get_user_id(x_user_id)
    with engine.begin() as conn:
        result = conn.execute(
            select(transactions)
            .where(transactions.c.user_id == user_id)
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
        )
        for row in rows
    ]


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
