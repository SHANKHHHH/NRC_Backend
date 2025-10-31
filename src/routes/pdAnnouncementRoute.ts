import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware';
import {
  getAllPDAnnouncements,
  createPDAnnouncement,
  updatePDAnnouncement,
  deletePDAnnouncement
} from '../controllers/pdAnnouncementController';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET all active PD announcements (public to all authenticated users)
router.get('/', asyncHandler(getAllPDAnnouncements));

// POST create new PD announcement (admin/planner only - checked in controller)
router.post('/', asyncHandler(createPDAnnouncement));

// PUT update PD announcement (admin/planner only - checked in controller)
router.put('/:id', asyncHandler(updatePDAnnouncement));

// DELETE PD announcement (admin/planner only - checked in controller)
router.delete('/:id', asyncHandler(deletePDAnnouncement));

export default router;

