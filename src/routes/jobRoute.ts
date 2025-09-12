import { Router } from 'express';
import { asyncHandler, addMachineFiltering } from '../middleware';
import { authenticateToken, requireAdminJWT } from '../middleware/auth';
import {
  createJob,
  getAllJobs,
  getJobByNrcJobNo,
  updateJobByNrcJobNo,
  deleteJobByNrcJobNo,
  holdJobByNrcJobNo,
} from '../controllers/jobController';

const router = Router();

// Chain routes for getting all jobs and creating a new job
router
  .route('/')
<<<<<<< Updated upstream
  .get(authenticateToken, asyncHandler(getAllJobs))
=======
  .get(authenticateToken, addMachineFiltering, cacheMiddleware(2 * 60 * 1000), asyncHandler(getAllJobs)) // Cache for 2 minutes
>>>>>>> Stashed changes
  .post(authenticateToken, asyncHandler(createJob));

// Chain routes for getting, updating, and deleting a specific job by NRC Job No
router
  .route('/:nrcJobNo')
  .get(authenticateToken, asyncHandler(getJobByNrcJobNo))
  .put(requireAdminJWT, asyncHandler(updateJobByNrcJobNo))
  .delete(requireAdminJWT, asyncHandler(deleteJobByNrcJobNo));

router
  .route('/:nrcJobNo/hold')
  .patch(authenticateToken, asyncHandler(holdJobByNrcJobNo));

export default router; 