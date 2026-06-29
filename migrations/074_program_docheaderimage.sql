-- 074_program_docheaderimage.sql
-- Adds Program.docheaderimage (NVARCHAR(255), nullable) — the filename of a wide logo/banner
-- the admin uploads for the generated "Categories, Criteria & Questions" documents (rendered
-- into the black header band, like the printed reference). Stored under the program's folder
-- on the shared filestore: programs/{programid}/{filename}. Null = text-only band (program name).

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Program') AND name = 'docheaderimage'
)
    ALTER TABLE dbo.Program ADD docheaderimage NVARCHAR(255) NULL;
