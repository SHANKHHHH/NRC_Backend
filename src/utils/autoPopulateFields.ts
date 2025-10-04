import { prisma } from '../lib/prisma';

/**
 * Calculate shift based on current time
 * Shifts: Morning (6AM-2PM), Afternoon (2PM-10PM), Night (10PM-6AM)
 */
export function calculateShift(date: Date = new Date()): string {
  const hours = date.getHours();
  
  if (hours >= 6 && hours < 14) {
    return 'Morning';
  } else if (hours >= 14 && hours < 22) {
    return 'Afternoon';
  } else {
    return 'Night';
  }
}

/**
 * Get job details for auto-populating fields
 */
export async function getJobDetailsForAutoPopulate(nrcJobNo: string) {
  const job = await prisma.job.findUnique({
    where: { nrcJobNo }
  });
  
  return job;
}

/**
 * Get machine code from job step
 */
export async function getMachineFromJobStep(jobStepId: number): Promise<string | null> {
  const jobStep = await prisma.jobStep.findUnique({
    where: { id: jobStepId },
    select: { machineDetails: true }
  });
  
  if (jobStep?.machineDetails && Array.isArray(jobStep.machineDetails)) {
    const machines = jobStep.machineDetails as any[];
    if (machines.length > 0 && machines[0].machineCode) {
      return machines[0].machineCode;
    }
  }
  
  return null;
}

/**
 * Auto-populate common step fields
 */
export async function autoPopulateStepFields(
  data: any,
  jobStepId: number,
  userId?: string,
  nrcJobNo?: string
): Promise<any> {
  const currentDate = new Date();
  const populatedData = { ...data };
  
  // Auto-populate date if not provided
  if (!populatedData.date) {
    populatedData.date = currentDate;
  }
  
  // Auto-populate shift if not provided
  if (!populatedData.shift) {
    populatedData.shift = calculateShift(currentDate);
  }
  
  // Auto-populate operator name from user if not provided
  if (!populatedData.operatorName && !populatedData.oprName && userId) {
    if ('operatorName' in data || data.operatorName === undefined) {
      populatedData.operatorName = userId;
    }
    if ('oprName' in data || data.oprName === undefined) {
      populatedData.oprName = userId;
    }
  }
  
  // Auto-populate machine from job step if not provided
  if (!populatedData.machine && !populatedData.machineNo) {
    const machineCode = await getMachineFromJobStep(jobStepId);
    if (machineCode) {
      if ('machine' in data || data.machine === undefined) {
        populatedData.machine = machineCode;
      }
      if ('machineNo' in data || data.machineNo === undefined) {
        populatedData.machineNo = machineCode;
      }
    }
  }
  
  return populatedData;
}

/**
 * Auto-populate PaperStore specific fields from job details
 */
export async function autoPopulatePaperStoreFields(
  data: any,
  nrcJobNo: string
): Promise<any> {
  const populatedData = { ...data };
  const job = await getJobDetailsForAutoPopulate(nrcJobNo);
  
  if (job) {
    // Auto-populate sheetSize from boardSize
    if (!populatedData.sheetSize && job.boardSize) {
      populatedData.sheetSize = job.boardSize;
    }
    
    // Note: GSM is now manually entered in the frontend form, not auto-populated
  }
  
  // Auto-populate issuedDate if not provided
  if (!populatedData.issuedDate) {
    populatedData.issuedDate = new Date();
  }
  
  return populatedData;
}

/**
 * Auto-populate Corrugation specific fields from job details
 */
export async function autoPopulateCorrugationFields(
  data: any,
  nrcJobNo: string
): Promise<any> {
  const populatedData = { ...data };
  const job = await getJobDetailsForAutoPopulate(nrcJobNo);
  
  if (job) {
    // Auto-populate size from boardSize
    if (!populatedData.size && job.boardSize) {
      populatedData.size = job.boardSize;
    }
    
    // Auto-populate flute from fluteType
    if (!populatedData.flute && job.fluteType) {
      populatedData.flute = job.fluteType;
    }
    
    // Auto-populate gsm1 and gsm2 from topFaceGSM and bottomLinerGSM
    if (!populatedData.gsm1 && job.topFaceGSM) {
      populatedData.gsm1 = job.topFaceGSM;
    }
    
    if (!populatedData.gsm2 && job.bottomLinerGSM) {
      populatedData.gsm2 = job.bottomLinerGSM;
    }
  }
  
  return populatedData;
}

/**
 * Auto-populate Punching specific fields from job details
 */
export async function autoPopulatePunchingFields(
  data: any,
  nrcJobNo: string
): Promise<any> {
  const populatedData = { ...data };
  const job = await getJobDetailsForAutoPopulate(nrcJobNo);
  
  if (job) {
    // Auto-populate die from diePunchCode
    if (!populatedData.die && job.diePunchCode) {
      populatedData.die = job.diePunchCode.toString();
    }
  }
  
  return populatedData;
}

