-- ONB-02: products.brief_text + brief_attachments for the PDF/MD upload path.
-- brief_attachments is reserved for the R2 follow-up; ships as an empty
-- jsonb array today so the column shape is stable.
ALTER TABLE products ADD COLUMN IF NOT EXISTS brief_text text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brief_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
