ALTER TABLE pay_schedules
ADD COLUMN category_id INTEGER REFERENCES categories(id);
