import { Router } from 'express';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { createQualityDept, getQualityDeptById, getQualityDeptByJobStepId, getAllQualityDepts, updateQualityDept, deleteQualityDept, getQualityDeptByNrcJobNo, updateQualityDeptStatus, holdQualityDept, resumeQualityDept, startQualityWork } from '../controllers/qualityDeptController';

const router = Router();

router.post('/', authenticateToken, asyncHandler(createQualityDept));
router.get('/by-step-id/:jobStepId', authenticateToken, asyncHandler(getQualityDeptByJobStepId));
router.get('/by-job/:nrcJobNo', authenticateToken, asyncHandler(getQualityDeptByNrcJobNo));
router.get('/:id', authenticateToken, asyncHandler(getQualityDeptById));
router.get('/', authenticateToken, addMachineFiltering, asyncHandler(getAllQualityDepts));

router.put('/:nrcJobNo', authenticateToken, asyncHandler(updateQualityDept));
router.patch('/:nrcJobNo/status', authenticateToken, asyncHandler(updateQualityDeptStatus));
router.post('/:nrcJobNo/start', authenticateToken, asyncHandler(startQualityWork));
router.post('/:nrcJobNo/hold', authenticateToken, asyncHandler(holdQualityDept));
router.post('/:nrcJobNo/resume', authenticateToken, asyncHandler(resumeQualityDept));
router.delete('/:id', requireAdminJWT, asyncHandler(deleteQualityDept));

export default router; 