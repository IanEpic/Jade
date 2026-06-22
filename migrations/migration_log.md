# JADE DB Migration Log — Round 2

Round 1 migrations (001–042) are archived in `migrations/round1/`. All were applied to production on 2026-06-21.

Round 2 covers ongoing development on the live platform. Number from 043 onwards.

---

## 043 — Drop orphaned TopMenu FK columns from Program

`043_drop_program_topmenu_columns.sql`

Drops `adminmenu`, `usermenu`, `judgemenu` from `Program`. These integer FK
columns pointed at the `TopMenu` table, which (along with `TopMenuButton`)
was removed in a prior Round 1 migration. Dead `TopMenu` model/associations/
query were removed from the codebase in the same change. No defaults or FK
constraints on the columns; nothing in the Node app read them.

- Applied to PROD: 2026-06-22 ✓ (code deployed to both nodes first, then columns dropped)
