-- Migration 046: Category types for finalist-text generation
-- Per-program "category type" groups (Best Event, Achievements, Industry, Management)
-- carry per-group format rules. Categories link to a type; the finalist-text generator
-- uses the type's rules plus program-wide rules (JudgingModel.finalisttextrules).

IF OBJECT_ID('dbo.CategoryType', 'U') IS NULL
CREATE TABLE [dbo].[CategoryType] (
    categorytypeid INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CategoryType PRIMARY KEY,
    programid      INT NOT NULL,
    name           NVARCHAR(100) NOT NULL,
    orda           FLOAT NULL,
    rules          NVARCHAR(MAX) NULL,
    deleted        BIT NOT NULL CONSTRAINT DF_CategoryType_deleted DEFAULT 0
);

IF COL_LENGTH('dbo.Category', 'categorytypeid') IS NULL
    ALTER TABLE [dbo].[Category] ADD categorytypeid INT NULL;

IF COL_LENGTH('dbo.JudgingModel', 'finalisttextrules') IS NULL
    ALTER TABLE [dbo].[JudgingModel] ADD finalisttextrules NVARCHAR(MAX) NULL;
