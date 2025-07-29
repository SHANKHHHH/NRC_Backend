import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  checkJobCompletion,
  completeJob,
  getAllCompletedJobs,
  getCompletedJobById
} from '../controllers/completedJobController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Check if a job is ready for completion
router.get('/check/:nrcJobNo', checkJobCompletion);

// Complete a job
router.post('/complete/:nrcJobNo', completeJob);

// Get all completed jobs
router.get('/', getAllCompletedJobs);

// Get a specific completed job
router.get('/:id', getCompletedJobById);

export default router; 