import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import {
  checkJobCompletion,
  completeJob,
  getAllCompletedJobs,
  getCompletedJobById,
  checkAndAutoCompleteJob,
  getJobsReadyForCompletion
} from '../controllers/completedJobController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Check if a job is ready for completion
router.get('/check/:nrcJobNo', asyncHandler(checkJobCompletion));

// Check if a job is ready for completion and auto-complete it
router.post('/check-and-complete/:nrcJobNo', asyncHandler(checkAndAutoCompleteJob));

// Get all jobs that are ready for completion
router.get('/ready-for-completion', asyncHandler(getJobsReadyForCompletion));

// Scheduler management routes
router.post('/scheduler/start', (req, res) => {
  const { startAutoCompletionScheduler } = require('../../utils/autoCompletionScheduler');
  startAutoCompletionScheduler();
  res.json({ success: true, message: 'Auto-completion scheduler started' });
});

router.post('/scheduler/stop', (req, res) => {
  const { stopAutoCompletionScheduler } = require('../../utils/autoCompletionScheduler');
  stopAutoCompletionScheduler();
  res.json({ success: true, message: 'Auto-completion scheduler stopped' });
});

router.get('/scheduler/status', (req, res) => {
  const { getSchedulerStatus } = require('../../utils/autoCompletionScheduler');
  const status = getSchedulerStatus();
  res.json({ success: true, data: status });
});

router.post('/scheduler/trigger-check', async (req, res) => {
  const { triggerCompletionCheck } = require('../../utils/autoCompletionScheduler');
  const { nrcJobNo } = req.body;
  
  if (!nrcJobNo) {
    return res.status(400).json({ success: false, message: 'nrcJobNo is required' });
  }
  
  try {
    const result = await triggerCompletionCheck(nrcJobNo);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error triggering completion check' });
  }
});

// Complete a job
router.post('/complete/:nrcJobNo', asyncHandler(completeJob));

// Get all completed jobs
router.get('/', asyncHandler(getAllCompletedJobs));

// Get a specific completed job
router.get('/:id', asyncHandler(getCompletedJobById));

export default router;