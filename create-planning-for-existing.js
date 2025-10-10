const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { job: null, po: null, demand: 'medium', force: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--job' && args[i + 1]) { result.job = args[++i]; continue; }
    if (a === '--po' && args[i + 1]) { result.po = parseInt(args[++i], 10); continue; }
    if (a === '--demand' && args[i + 1]) { result.demand = args[++i]; continue; }
    if (a === '--force') { result.force = true; continue; }
  }
  return result;
}

const DEFAULT_STEPS = [
  { stepNo: 1, stepName: 'PaperStore' },
  { stepNo: 2, stepName: 'PrintingDetails' },
  { stepNo: 3, stepName: 'Corrugation' },
  { stepNo: 4, stepName: 'FluteLamination' },
  { stepNo: 5, stepName: 'Punching' },
  { stepNo: 6, stepName: 'DieCutting' },
  { stepNo: 7, stepName: 'SideFlapPasting' },
  { stepNo: 8, stepName: 'QualityDept' },
  { stepNo: 9, stepName: 'DispatchProcess' },
];

async function main() {
  const { job: nrcJobNo, po: purchaseOrderId, demand, force } = parseArgs();

  if (!nrcJobNo && !purchaseOrderId) {
    console.log('Usage: node create-planning-for-existing.js --job "<NRC_JOB_NO>" [--po <PO_ID>] [--demand high|medium|low] [--force]');
    process.exit(1);
  }

  // Resolve nrcJobNo from PO if only PO ID provided
  let resolvedJobNo = nrcJobNo;
  if (!resolvedJobNo && purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { jobNrcJobNo: true, id: true } });
    if (!po || !po.jobNrcJobNo) {
      console.error(`❌ PurchaseOrder ${purchaseOrderId} not found or not linked to a job.`);
      process.exit(1);
    }
    resolvedJobNo = po.jobNrcJobNo;
  }

  // Validate job exists
  const job = await prisma.job.findUnique({ where: { nrcJobNo: resolvedJobNo } });
  if (!job) {
    console.error(`❌ Job not found for nrcJobNo: ${resolvedJobNo}`);
    process.exit(1);
  }

  console.log(`📌 Creating JobPlanning for job: ${resolvedJobNo}${purchaseOrderId ? ` (PO ${purchaseOrderId})` : ''}`);

  // Check if planning exists
  const existing = await prisma.jobPlanning.findFirst({ where: { nrcJobNo: resolvedJobNo }, orderBy: { createdAt: 'desc' } });
  if (existing && !force) {
    console.log(`ℹ️ JobPlanning already exists (jobPlanId: ${existing.jobPlanId}). Use --force to create another.`);
    return;
  }

  // Attempt to pull machine details from PO Machines (if provided)
  let machineAssignmentsByStep = new Map();
  if (purchaseOrderId) {
    // For simplicity, assign all PO machines to Printing (2), Corrugation (3), Flute Lamination (4), Punching (5), Die Cutting (6)
    // PaperStore(1), SideFlap(7), Quality(8), Dispatch(9) usually no machine requirements
    const poMachines = await prisma.purchaseOrderMachine.findMany({
      where: { purchaseOrderId },
      select: { machineId: true, machine: { select: { machineCode: true, machineType: true, description: true, unit: true } } }
    });
    const stepsNeedingMachines = [2,3,4,5,6];
    for (const stepNo of stepsNeedingMachines) {
      machineAssignmentsByStep.set(stepNo, poMachines.map(pm => ({
        machineId: pm.machineId,
        machineCode: pm.machine?.machineCode || null,
        machineType: pm.machine?.machineType || 'Unknown',
        unit: pm.machine?.unit || 'Mk'
      })));
    }
  }

  const stepsData = DEFAULT_STEPS.map(s => ({
    stepNo: s.stepNo,
    stepName: s.stepName,
    status: 'planned',
    machineDetails: machineAssignmentsByStep.get(s.stepNo) || []
  }));

  const created = await prisma.jobPlanning.create({
    data: {
      nrcJobNo: resolvedJobNo,
      purchaseOrderId: purchaseOrderId || null,
      jobDemand: demand === 'high' || demand === 'low' ? demand : 'medium',
      steps: {
        create: stepsData
      }
    },
    include: { steps: true }
  });

  console.log('✅ Created JobPlanning');
  console.log('JobPlanId:', created.jobPlanId);
  console.log('nrcJobNo:', created.nrcJobNo);
  console.log('jobDemand:', created.jobDemand);
  console.log('steps:', created.steps.length);
  const withMachines = created.steps.filter(s => Array.isArray(s.machineDetails) && s.machineDetails.length > 0).length;
  console.log('steps with machines:', withMachines);
}

main()
  .catch(err => { console.error('❌ Error:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
