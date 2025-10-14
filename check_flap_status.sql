-- Check Flap Pasting status for job "NON-10GM X 5KG BIG-5 PLAY"
SELECT 
    sfp.id,
    sfp."jobNrcJobNo",
    sfp.status,
    sfp."jobStepId",
    sfp.quantity,
    sfp.wastage,
    sfp."machineNo",
    sfp.shift,
    sfp."operatorName",
    js."stepNo",
    js."stepName",
    js.status as "jobStepStatus"
FROM "SideFlapPasting" sfp
LEFT JOIN "JobStep" js ON js.id = sfp."jobStepId"
WHERE sfp."jobNrcJobNo" LIKE '%NON-10GM%'
   OR sfp."jobNrcJobNo" LIKE '%5KG%';

-- Also check JobStep for this job
SELECT 
    js.id,
    js."stepNo",
    js."stepName",
    js.status,
    jp."nrcJobNo"
FROM "JobStep" js
JOIN "JobPlanning" jp ON jp."jobPlanId" = js."jobPlanningId"
WHERE jp."nrcJobNo" LIKE '%NON-10GM%'
   OR jp."nrcJobNo" LIKE '%5KG%'
ORDER BY js."stepNo";

