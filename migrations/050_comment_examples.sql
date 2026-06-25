-- Migration 050: Editable good/bad comment examples for the AI comment check
-- Surfaces the example comments that were hardcoded in the check prompt as editable
-- data on JudgingModel, so admins can tune them (Admin → AI Rules → Judging Guidelines).
-- The comment checker reads these alongside commentguidelines.

IF COL_LENGTH('dbo.JudgingModel', 'commentexamplesgood') IS NULL
    ALTER TABLE [dbo].[JudgingModel] ADD commentexamplesgood NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.JudgingModel', 'commentexamplesbad') IS NULL
    ALTER TABLE [dbo].[JudgingModel] ADD commentexamplesbad NVARCHAR(MAX) NULL;
GO

-- Seed the eventawards judging model(s) — only where still empty (idempotent).
UPDATE jm SET commentexamplesgood =
N'Good comments are specific, evidence-based and constructive:
- Specific praise tied to evidence: "Securing 15 community partners and weaving their input through the program gave the event genuine authenticity, and the 30% attendance growth shows it resonated."
- Constructive, future-focused advice: "Next year, consider capturing structured sponsor ROI data after the event; it would strengthen both your renewals and future entries."
- A consulting tone: "As you scale, a documented risk-management plan for the outdoor stages would protect the experience you''ve built."'
FROM JudgingModel jm
  INNER JOIN Program p ON p.judgingmodelid = jm.judgingmodelid
WHERE p.programid IN (1055, 1056)
  AND (jm.commentexamplesgood IS NULL OR LEN(jm.commentexamplesgood) = 0);

UPDATE jm SET commentexamplesbad =
N'Unacceptable comments include:
- Outcome or ranking statements: "this is a winning entry", "one of the strongest entries I''ve come across", "a clear standout", "the best in its category".
- Vague or no substance: "Great event, well done", "Good job overall".
- Critiquing the entry document rather than the event: "please spell-check your entry", "add more photos", "your entry lacks evidence".
- Asking for things outside the entry rules: "a video would be helpful".
- Suggesting there are no improvements: "it is difficult to identify any areas for improvement".
- Revealing or implying who the judge is.'
FROM JudgingModel jm
  INNER JOIN Program p ON p.judgingmodelid = jm.judgingmodelid
WHERE p.programid IN (1055, 1056)
  AND (jm.commentexamplesbad IS NULL OR LEN(jm.commentexamplesbad) = 0);
