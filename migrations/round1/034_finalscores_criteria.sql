-- Migration 034: FinalScoreCriteria table
-- Stores per-criteria scores alongside the overall FinalScore.
-- Final score = weighted average of criteria scores (each scaled to mean=85, SD=5).

CREATE TABLE FinalScoreCriteria (
    finalscoreid  INT          NOT NULL,
    criteriaid    INT          NOT NULL,
    criterianame  NVARCHAR(200) NULL,
    weight        FLOAT        NOT NULL,
    score         FLOAT        NOT NULL,
    CONSTRAINT PK_FinalScoreCriteria PRIMARY KEY (finalscoreid, criteriaid),
    CONSTRAINT FK_FinalScoreCriteria_FinalScore FOREIGN KEY (finalscoreid)
        REFERENCES FinalScore (finalscoreid) ON DELETE CASCADE
);
