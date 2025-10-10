import { Router } from 'express';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import { cacheMiddleware } from '../middleware/cache';
import {
  createJob,
  getAllJobs,
  getJobByNrcJobNo,
  getJobWithPODetails,
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
  .get(authenticateToken, addMachineFiltering, cacheMiddleware(2 * 60 * 1000), asyncHandler(getAllJobs)) // Cache for 2 minutes
  .post(authenticateToken, asyncHandler(createJob));

// Get job with comprehensive PO details (Admin and Planner only) - MUST be before /:nrcJobNo route
router
  .route('/:nrcJobNo/with-po-details')
  .get(authenticateToken, cacheMiddleware(5 * 60 * 1000), asyncHandler(getJobWithPODetails));

router
  .route('/:nrcJobNo/hold')
  .patch(authenticateToken, asyncHandler(holdJobByNrcJobNo));

// Check job planning status - MUST be before /:nrcJobNo route
router
  .route('/:nrcJobNo/planning-status')
  .get(authenticateToken, asyncHandler(checkJobPlanningStatus));

// Chain routes for getting, updating, and deleting a specific job by NRC Job No
router
  .route('/:nrcJobNo')
  .get(authenticateToken, cacheMiddleware(5 * 60 * 1000), asyncHandler(getJobByNrcJobNo)) // Cache for 5 minutes
  .put(authenticateToken, asyncHandler(updateJobByNrcJobNo))
  .delete(requireAdminJWT, asyncHandler(deleteJobByNrcJobNo));

// Recalculate shared card diff dates for all jobs
router
  .route('/recalculate-shared-card-diff')
  .post(requireAdminJWT, asyncHandler(recalculateSharedCardDiffDate));

export default router;