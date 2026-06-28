-- 069_userpage_withsidebar.sql
-- Adds UserPage.withsidebar (BIT, NOT NULL, default 0). When set, a user page is rendered
-- inside the home framework (with the program sidebar + nav); when 0 it renders standalone
-- (current behaviour). Admins choose per page on Admin → Setup → User Pages. Existing pages
-- default to 0 so nothing changes until an admin opts a page in.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.UserPage') AND name = 'withsidebar'
)
BEGIN
    ALTER TABLE dbo.UserPage
        ADD withsidebar BIT NOT NULL
        CONSTRAINT DF_UserPage_withsidebar DEFAULT 0;
END;
