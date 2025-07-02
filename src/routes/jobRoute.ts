import { Router } from 'express';
import { asyncHandler } from '../middleware';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import {
  createJob,
  getAllJobs,
  getJobByNrcJobNo,
  updateJobByNrcJobNo,
  deleteJobByNrcJobNo,
} from '../controllers/jobController';

const router = Router();

// Chain routes for getting all jobs and creating a new job
router
  .route('/')
  .get(authenticateToken, asyncHandler(getAllJobs))
  .post(authenticateToken, asyncHandler(createJob));

// Chain routes for getting, updating, and deleting a specific job by NRC Job No
router
  .route('/:nrcJobNo')
  .get(authenticateToken, asyncHandler(getJobByNrcJobNo))
  .put(requireAdminJWT, asyncHandler(updateJobByNrcJobNo))
  .delete(requireAdminJWT, asyncHandler(deleteJobByNrcJobNo));

export default router; 