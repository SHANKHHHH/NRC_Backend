import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
// Machine access checks removed for PaperStore create/update per requirement
import { RoleManager } from '../utils/roleUtils';

// Create PaperStore step detail, only if previous step is accepted
export const createPaperStore = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Check machine access for paper store
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  
  // Machine access check removed: allow creating PaperStore regardless of machine assignment
  
  // Find the JobStep
  const jobStep = await prisma.jobStep.findUnique({ where: { id: jobStepId }, include: { jobPlanning: { include: { steps: true } } } });
  if (!jobStep) throw new AppError('JobStep not found', 404);
  // Check if this is the first step or not
  const steps = jobStep.jobPlanning.steps.sort((a, b) => a.stepNo - b.stepNo);
  const thisStepIndex = steps.findIndex(s => s.id === jobStepId);
  if (thisStepIndex > 0) {
    const prevStep = steps[thisStepIndex - 1];
    // Fetch the detail model for the previous step
    let prevDetail: any = null;
    switch (prevStep.stepName) {
      case 'PaperStore':
        prevDetail = await prisma.paperStore.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'PrintingDetails':
        prevDetail = await prisma.printingDetails.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'Corrugation':
        prevDetail = await prisma.corrugation.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'FluteLaminateBoardConversion':
        prevDetail = await prisma.fluteLaminateBoardConversion.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'Punching':
        prevDetail = await prisma.punching.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'SideFlapPasting':
        prevDetail = await prisma.sideFlapPasting.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'QualityDept':
        prevDetail = await prisma.qualityDept.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'DispatchProcess':
        prevDetail = await prisma.dispatchProcess.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      default:
        break;
    }
    if (!prevDetail || prevDetail.status !== 'accept') {
      throw new AppError('Previous step must be accepted before creating this step', 400);
    }
  }
  // Create PaperStore
  const paperStore = await prisma.paperStore.create({ data: { ...data, jobStepId } });
  // Link to JobStep
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { paperStore: { connect: { id: paperStore.id } } } });

  // Log PaperStore step creation
  if (req.user?.userId) {
    // Get the nrcJobNo from the jobStep
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: jobStepId },
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true
          }
        }
      }
    });

    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_CREATED,
      `Created PaperStore step for jobStepId: ${jobStepId}`,
      'PaperStore',
      paperStore.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
    );
  }
  res.status(201).json({ success: true, data: paperStore, message: 'PaperStore step created' });
};

export const getPaperStoreById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const paperStore = await prisma.paperStore.findUnique({ where: { id: Number(id) } });
  if (!paperStore) throw new AppError('PaperStore not found', 404);
  res.status(200).json({ success: true, data: paperStore });
};

export const getAllPaperStores = async (req: Request, res: Response) => {
  const userMachineIds = req.userMachineIds; // From middleware
  const userRole = req.user?.role || '';
  
  // Get role-based step data from job plannings
  const { getRoleBasedStepData } = await import('../utils/stepDataHelper');
  const paperStoreSteps = await getRoleBasedStepData(userMachineIds, userRole, 'PaperStore');
  
  res.status(200).json({ 
    success: true, 
    count: paperStoreSteps.length, 
    data: paperStoreSteps 
  });
};

export const getPaperStoreByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const paperStores = await prisma.paperStore.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: paperStores });
};

export const updatePaperStore = async (req: Request, res: Response) => {
  // const { nrcJobNo } = req.params;
  const userRole = req.user?.role;
  // Check if Flying Squad is trying to update non-QC fields
  if (userRole && RoleManager.canOnlyPerformQC(userRole)) {
    const allowedFields = ['qcCheckSignBy', 'qcCheckAt', 'remarks'];
    const bodyKeys = Object.keys(req.body);
    const restrictedFields = bodyKeys.filter(key => !allowedFields.includes(key));
    
    if (restrictedFields.length > 0) {
      throw new AppError(
        `Flying Squad can only update QC-related fields. Restricted fields: ${restrictedFields.join(', ')}. Allowed fields: ${allowedFields.join(', ')}`, 
        403
      );
    }

    // Ensure qcCheckSignBy is set to current user
    if (req.body.qcCheckSignBy !== undefined) {
      req.body.qcCheckSignBy = req.user?.userId;
    }

    // Ensure qcCheckAt is set to current timestamp
    if (req.body.qcCheckAt !== undefined) {
      req.body.qcCheckAt = new Date();
    }
  }
  // const paperStore = await prisma.paperStore.update({ where: { jobNrcJobNo: nrcJobNo }, data: req.body });

  // // Log PaperStore step update
  // if (req.user?.userId) {
  //   await logUserActionWithResource(
  //     req.user.userId,
  //     ActionTypes.JOBSTEP_UPDATED,
  //     `Updated PaperStore step with id: ${nrcJobNo}`,
  //     'PaperStore',
  //     nrcJobNo
  //   );
  // }
  // res.status(200).json({ success: true, data: paperStore, message: 'PaperStore updated' });
  const { nrcJobNo } = req.params;

// Step 1: Find the PaperStore by jobNrcJobNo
const existing = await prisma.paperStore.findFirst({
  where: { jobNrcJobNo: nrcJobNo },
});

if (!existing) {
  return res.status(404).json({ success: false, message: 'PaperStore not found' });
}

// Machine access enforcement removed for update as well

// Step 2: Use its ID to update (since ID is unique)
const updated = await prisma.paperStore.update({
  where: { id: existing.id },
  data: req.body,
});

// Log action
if (req.user?.userId) {
  await logUserActionWithResource(
    req.user.userId,
    ActionTypes.JOBSTEP_UPDATED,
    `Updated PaperStore step with jobNrcJobNo: ${nrcJobNo}`,
    'PaperStore',
    nrcJobNo
  );
}

res.status(200).json({ success: true, data: updated, message: 'PaperStore updated' });

};

// export const updatePaperStoreStatus = async (req: Request, res: Response) => {
//   const { nrcJobNo } = req.params;
//   const { status } = req.body;
  
//   // Validate status
//   if (!['reject', 'accept', 'hold', 'in_progress'].includes(status)) {
//     throw new AppError('Invalid status. Must be one of: reject, accept, hold, in_progress', 400);
//   }
  
//   // Find the PaperStore by jobNrcJobNo
//   const existing = await prisma.paperStore.findFirst({
//     where: { jobNrcJobNo: nrcJobNo },
//   });
  
//   if (!existing) {
//     return res.status(404).json({ success: false, message: 'PaperStore not found' });
//   }
  
//   // Update the status
//   const updated = await prisma.paperStore.update({
//     where: { id: existing.id },
//     data: { status: status as any },
//   });
  
//   // Log action
//   if (req.user?.userId) {
//     await logUserActionWithResource(
//       req.user.userId,
//       ActionTypes.JOBSTEP_UPDATED,
//       `Updated PaperStore status to ${status} for jobNrcJobNo: ${nrcJobNo}`,
//       'PaperStore',
//       nrcJobNo
//     );
//   }
  
//   res.status(200).json({ success: true, data: updated, message: 'PaperStore status updated' });
// };

export const deletePaperStore = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.paperStore.delete({ where: { id: Number(id) } });

  // Log PaperStore step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted PaperStore step with id: ${id}`,
      'PaperStore',
      id
    );
  }
  res.status(200).json({ success: true, message: 'PaperStore deleted' });
}; 