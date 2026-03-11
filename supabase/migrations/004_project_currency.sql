-- Add currency column to projects (defaults to USD)
ALTER TABLE projects ADD COLUMN currency text NOT NULL DEFAULT 'USD';
