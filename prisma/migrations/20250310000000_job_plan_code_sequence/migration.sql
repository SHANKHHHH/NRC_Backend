-- CreateTable: JobPlanCodeSequence for monthly sequence counter (avoids reusing codes after completed jobs leave JobPlanning)
CREATE TABLE "JobPlanCodeSequence" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "lastUsedSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobPlanCodeSequence_pkey" PRIMARY KEY ("id")
);

-- Unique constraint so we have at most one row per (year, month)
CREATE UNIQUE INDEX "JobPlanCodeSequence_year_month_key" ON "JobPlanCodeSequence"("year", "month");

-- Backfill: set lastUsedSequence from existing JobPlanning jobPlanCode (max sequence per month)
-- jobPlanCode format: 'MAR26-164' -> we need the number after the last '-'
INSERT INTO "JobPlanCodeSequence" ("year", "month", "lastUsedSequence")
SELECT
  date_part('year', "createdAt")::int AS year,
  date_part('month', "createdAt")::int AS month,
  COALESCE(MAX(
    CAST(
      NULLIF(SUBSTRING("jobPlanCode" FROM '-([0-9]+)$'), '') AS INTEGER
    )
  ), 0) AS lastUsedSequence
FROM "JobPlanning"
WHERE "jobPlanCode" IS NOT NULL
  AND "jobPlanCode" ~ '-\d+$'
GROUP BY date_part('year', "createdAt"), date_part('month', "createdAt")
ON CONFLICT ("year", "month") DO NOTHING;
