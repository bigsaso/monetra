"""
Transaction Auto-Classification Engine

Provides rule-based pattern matching for automatic transaction categorization.
Learns from user's historical categorization choices without using AI/ML.
"""

import re
from datetime import datetime
from typing import Optional
from sqlalchemy import Table, Column, Integer, String, DateTime, MetaData, select, and_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection


def extract_merchant_patterns(description: str) -> list[tuple[str, str]]:
    """
    Extract merchant patterns from a transaction description.

    Returns list of (pattern, pattern_type) tuples in order of specificity:
    1. Exact match (full description)
    2. Starts-with match (merchant name - first word/token)
    3. Contains match (merchant keyword)

    Args:
        description: Raw transaction description

    Returns:
        List of (pattern, pattern_type) tuples
    """
    if not description or not description.strip():
        return []

    patterns = []
    cleaned = description.strip().upper()

    # Pattern 1: Exact match (full description)
    patterns.append((cleaned, "exact"))

    # Pattern 2: Starts-with match (extract merchant name)
    # Match first word or first few words before common separators
    merchant_match = re.match(r'^([A-Z0-9]+(?:\s+[A-Z0-9]+)?)', cleaned)
    if merchant_match:
        merchant_name = merchant_match.group(1).strip()
        if merchant_name and merchant_name != cleaned:
            patterns.append((merchant_name, "starts_with"))

    # Pattern 3: Contains match (extract primary keyword)
    # Use first significant word (3+ chars) as contains pattern
    words = re.findall(r'[A-Z0-9]{3,}', cleaned)
    if words and len(words) > 0:
        keyword = words[0]
        if keyword != cleaned and (not merchant_match or keyword != merchant_match.group(1).strip()):
            patterns.append((keyword, "contains"))

    return patterns


def suggest_category(
    conn: Connection,
    user_id: int,
    description: str,
    classification_rules: Table
) -> tuple[Optional[str], Optional[float]]:
    """
    Suggest a category for a transaction based on learned patterns.

    Tries patterns in order of specificity:
    1. Exact match (95% confidence)
    2. Starts-with match (75% confidence)
    3. Contains match (50% confidence)

    When multiple rules match the same pattern, uses highest match_count.

    Args:
        conn: Database connection
        user_id: User ID
        description: Transaction description
        classification_rules: SQLAlchemy table for classification rules

    Returns:
        Tuple of (category, confidence) or (None, None) if no match
    """
    patterns = extract_merchant_patterns(description)
    if not patterns:
        return None, None

    # Define confidence levels by pattern type
    confidence_map = {
        "exact": 0.95,
        "starts_with": 0.75,
        "contains": 0.50
    }

    # Try each pattern in order of specificity
    for pattern, pattern_type in patterns:
        # Query for matching rules, ordered by match_count descending
        result = conn.execute(
            select(classification_rules.c.category, classification_rules.c.match_count)
            .where(
                and_(
                    classification_rules.c.user_id == user_id,
                    classification_rules.c.pattern == pattern,
                    classification_rules.c.pattern_type == pattern_type
                )
            )
            .order_by(classification_rules.c.match_count.desc())
            .limit(1)
        ).mappings().first()

        if result:
            category = result["category"]
            confidence = confidence_map.get(pattern_type, 0.5)
            return category, confidence

    return None, None


def upsert_classification_rule(
    conn: Connection,
    user_id: int,
    pattern: str,
    pattern_type: str,
    category: str,
    classification_rules: Table
) -> None:
    """
    Insert or update a classification rule.

    If the (user_id, pattern, category) combination exists, increments match_count
    and updates last_used_at. Otherwise creates a new rule.

    Args:
        conn: Database connection
        user_id: User ID
        pattern: Pattern to match
        pattern_type: Type of pattern ('exact', 'starts_with', 'contains')
        category: Category to assign
        classification_rules: SQLAlchemy table for classification rules
    """
    if not pattern or not category:
        return

    # Use PostgreSQL's ON CONFLICT for upsert
    stmt = pg_insert(classification_rules).values(
        user_id=user_id,
        pattern=pattern,
        pattern_type=pattern_type,
        category=category,
        match_count=1,
        last_used_at=datetime.utcnow()
    )

    # On conflict, increment match_count and update timestamp
    stmt = stmt.on_conflict_do_update(
        index_elements=['user_id', 'pattern', 'category'],
        set_={
            'match_count': classification_rules.c.match_count + 1,
            'last_used_at': datetime.utcnow(),
            'pattern_type': pattern_type  # Update pattern_type in case it changed
        }
    )

    conn.execute(stmt)


def learn_from_transactions(
    conn: Connection,
    user_id: int,
    transactions_table: Table,
    classification_rules: Table,
    transaction_ids: Optional[list[int]] = None
) -> int:
    """
    Learn classification patterns from user's transaction history.

    Extracts patterns from transaction descriptions and creates/updates
    classification rules based on their assigned categories.

    Args:
        conn: Database connection
        user_id: User ID
        transactions_table: SQLAlchemy table for transactions
        classification_rules: SQLAlchemy table for classification rules
        transaction_ids: Optional list of specific transaction IDs to learn from.
                        If None, learns from all user transactions with categories.

    Returns:
        Number of patterns learned
    """
    # Build query to fetch transactions with categories
    query = select(
        transactions_table.c.id,
        transactions_table.c.notes,
        transactions_table.c.category
    ).where(
        and_(
            transactions_table.c.user_id == user_id,
            transactions_table.c.category.isnot(None),
            transactions_table.c.category != ''
        )
    )

    # Filter by specific transaction IDs if provided
    if transaction_ids is not None:
        query = query.where(transactions_table.c.id.in_(transaction_ids))

    result = conn.execute(query)
    rows = result.mappings().all()

    patterns_learned = 0

    for row in rows:
        description = row["notes"] or ""
        category = row["category"]

        if not description or not category:
            continue

        # Extract all patterns from this transaction
        patterns = extract_merchant_patterns(description)

        # Create/update rules for each pattern
        for pattern, pattern_type in patterns:
            upsert_classification_rule(
                conn,
                user_id,
                pattern,
                pattern_type,
                category,
                classification_rules
            )
            patterns_learned += 1

    return patterns_learned
