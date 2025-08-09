import { Router } from 'express';
import { asyncHandler } from '../middleware';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { cacheMiddleware } from '../middleware/cache';
import {
  createJob,
  getAllJobs,
  getJobByNrcJobNo,
  updateJobByNrcJobNo,
  deleteJobByNrcJobNo,
  holdJobByNrcJobNo,
  checkJobPlanningStatus,
  recalculateSharedCardDiffDate,
} from '../controllers/jobController';

const router = Router();

// Chain routes for getting all jobs and creating a new job
router
  .route('/')
  .get(authenticateToken, cacheMiddleware(2 * 60 * 1000), asyncHandler(getAllJobs)) // Cache for 2 minutes
  .post(authenticateToken, asyncHandler(createJob));

// Chain routes for getting, updating, and deleting a specific job by NRC Job No
router
  .route('/:nrcJobNo')
  .get(authenticateToken, cacheMiddleware(5 * 60 * 1000), asyncHandler(getJobByNrcJobNo)) // Cache for 5 minutes
  .put(requireAdminJWT, asyncHandler(updateJobByNrcJobNo))
  .delete(requireAdminJWT, asyncHandler(deleteJobByNrcJobNo));

router
  .route('/:nrcJobNo/hold')
  .patch(authenticateToken, asyncHandler(holdJobByNrcJobNo));

// Check job planning status
router
  .route('/:nrcJobNo/planning-status')
  .get(authenticateToken, asyncHandler(checkJobPlanningStatus));

// Recalculate shared card diff dates for all jobs
router
  .route('/recalculate-shared-card-diff')
  .post(requireAdminJWT, asyncHandler(recalculateSharedCardDiffDate));

export default router;