-- Migration 043: Drop orphaned TopMenu FK columns from Program
-- The TopMenu and TopMenuButton tables were removed in a prior migration.
-- The adminmenu / usermenu / judgemenu integer FK columns on Program were
-- left behind pointing at the now-deleted TopMenu table. Nothing reads them
-- in the Node app (model attributes and associations removed). Drop them.

IF COL_LENGTH('dbo.Program', 'adminmenu') IS NOT NULL
    ALTER TABLE [dbo].[Program] DROP COLUMN adminmenu;

IF COL_LENGTH('dbo.Program', 'usermenu') IS NOT NULL
    ALTER TABLE [dbo].[Program] DROP COLUMN usermenu;

IF COL_LENGTH('dbo.Program', 'judgemenu') IS NOT NULL
    ALTER TABLE [dbo].[Program] DROP COLUMN judgemenu;
