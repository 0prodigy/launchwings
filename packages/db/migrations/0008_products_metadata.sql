-- ONB-01: products.metadata for URL-importer payloads
-- (Firecrawl pages, Browserbase screenshot, extracted fields).
ALTER TABLE products ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
