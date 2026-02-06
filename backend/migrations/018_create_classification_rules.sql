-- Create transaction classification rules table
CREATE TABLE IF NOT EXISTS transaction_classification_rules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    pattern_type VARCHAR(20) NOT NULL CHECK (pattern_type IN ('exact', 'contains', 'starts_with')),
    category VARCHAR(255) NOT NULL,
    match_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, pattern, category)
);

-- Create indexes for fast pattern lookups
CREATE INDEX idx_classification_rules_user_pattern ON transaction_classification_rules(user_id, pattern);
CREATE INDEX idx_classification_rules_user_category ON transaction_classification_rules(user_id, category);
CREATE INDEX idx_classification_rules_pattern_type ON transaction_classification_rules(pattern_type);
