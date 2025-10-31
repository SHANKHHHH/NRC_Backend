import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/errorHandler';

const prisma = new PrismaClient();

// Get all active PD announcements
export const getAllPDAnnouncements = async (req: Request, res: Response) => {
  try {
    const announcements = await prisma.pDAnnouncement.findMany({
      where: {
        isActive: true,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      data: announcements,
    });
  } catch (error) {
    console.error('Get PD announcements error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// Create a new PD announcement (Admin or Planner only)
export const createPDAnnouncement = async (req: Request, res: Response) => {
  try {
    const { title, message, priority } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if user is admin or planner
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const userRole = user?.role?.toLowerCase() || '';
    if (userRole !== 'admin' && userRole !== 'planner') {
      throw new AppError('Only admin or planner can create announcements', 403);
    }

    if (!title || !message) {
      throw new AppError('Title and message are required', 400);
    }

    const announcement = await prisma.pDAnnouncement.create({
      data: {
        title,
        message,
        priority: priority || 'normal',
        createdBy: userId,
        isActive: true,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: announcement,
      message: 'Announcement created successfully',
    });
  } catch (error) {
    console.error('Create PD announcement error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

// Update a PD announcement (Admin or Planner only)
export const updatePDAnnouncement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, message, priority, isActive } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if user is admin or planner
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const userRole = user?.role?.toLowerCase() || '';
    if (userRole !== 'admin' && userRole !== 'planner') {
      throw new AppError('Only admin or planner can update announcements', 403);
    }

    const announcement = await prisma.pDAnnouncement.update({
      where: { id: parseInt(id) },
      data: {
        ...(title && { title }),
        ...(message && { message }),
        ...(priority && { priority }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: announcement,
      message: 'Announcement updated successfully',
    });
  } catch (error) {
    console.error('Update PD announcement error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

// Delete a PD announcement (Admin or Planner only)
export const deletePDAnnouncement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if user is admin or planner
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const userRole = user?.role?.toLowerCase() || '';
    if (userRole !== 'admin' && userRole !== 'planner') {
      throw new AppError('Only admin or planner can delete announcements', 403);
    }

    await prisma.pDAnnouncement.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully',
    });
  } catch (error) {
    console.error('Delete PD announcement error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

