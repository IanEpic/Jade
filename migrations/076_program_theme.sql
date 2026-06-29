-- 076_program_theme.sql
-- Per-program look & feel as design tokens (JSON), for token-driven programs (1057+). When set,
-- the app renders via the shared themed shell with these tokens injected as :root overrides
-- (colours/background/fonts), instead of the legacy filename HTML shell. NULL = legacy program
-- (≤1056) — unchanged. Additive + dormant; nothing reads it until a program has a theme.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Program') AND name = 'theme')
    ALTER TABLE dbo.Program ADD theme NVARCHAR(MAX) NULL;
