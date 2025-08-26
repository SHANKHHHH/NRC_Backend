import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
dotenv.config();

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason); // it will not crash the error it will jsut log the error..
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process, just log the error
});

import cookieParser from 'cookie-parser';
import {
  errorHandler,
  asyncHandler,
  AppError,
  requestLogger,
  performanceMonitor,
  securityHeaders,
  corsMiddleware,
  rateLimiter,
  requestSizeLimiter,
  sanitizeInput
} from './middleware';
import { batchRequestsMiddleware } from './middleware/batchRequests';
import { activityLogger } from './middleware/activityLogger';
import { startAutoCompletionScheduler } from './utils/autoCompletionScheduler';
import authRoutes from './routes/authRoute';
import jobRoutes from './routes/jobRoute';
import purchaseOrderRoutes from './routes/purchaseOrderRoute';
import jobPlanningRoutes from './routes/jobPlanningRoute';
import paperStoreRoutes from './routes/paperStoreRoute';
import printingDetailsRoute from './routes/printingDetailsRoute';
import corrugationRoute from './routes/corrugationRoute';
import fluteLaminateBoardConversionRoute from './routes/fluteLaminateBoardConversionRoute';
import punchingRoute from './routes/punchingRoute';
import sideFlapPastingRoute from './routes/sideFlapPastingRoute';
import qualityDeptRoute from './routes/qualityDeptRoute';
import dispatchProcessRoute from './routes/dispatchProcessRoute';
import activityLogRoutes from './routes/activityLogRoute';
import machineRoutes from './routes/machineRoute';
import completedJobRoutes from './routes/completedJobRoute';
import dashboardRoutes from './routes/dashboardRoute';
import userRoutes from './routes/userRoute';
import plannerDashboardRoutes from './routes/plannerDashboardRoute';

// Load environment variables


const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Security middleware (apply first)
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(rateLimiter(300, 15 * 60 * 1000)); // 100 requests per 15 minutes
app.use(requestSizeLimiter('10mb'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware
app.use(cookieParser());

// Logging and monitoring middleware
app.use(requestLogger);
app.use(performanceMonitor);
app.use(activityLogger); // Add activity logging middleware

// Input sanitization
app.use(sanitizeInput);

// Batch requests middleware (must be before other routes)
app.use(batchRequestsMiddleware);

// Routes
app.get("/", (req, res) => {
  res.status(200).send("ALB is working!");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// API routes - Only authentication routes with admin-protected user management
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/job-planning', jobPlanningRoutes);
app.use('/api/paper-store', paperStoreRoutes);
app.use('/api/printing-details', printingDetailsRoute);
app.use('/api/corrugation', corrugationRoute);
app.use('/api/flute-laminate-board-conversion', fluteLaminateBoardConversionRoute);
app.use('/api/punching', punchingRoute);
app.use('/api/side-flap-pasting', sideFlapPastingRoute);
app.use('/api/quality-dept', qualityDeptRoute);
app.use('/api/dispatch-process', dispatchProcessRoute);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/machines', machineRoutes);
app.use('/api/completed-jobs', completedJobRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/planner-dashboard', plannerDashboardRoutes);

// Test error handling routes
app.get('/api/test-error', (req: Request, res: Response, next: NextFunction) => {
  next(new AppError('This is a test error', 400));
});

app.get('/api/test-async-error', asyncHandler(async (req: Request, res: Response) => {
  throw new AppError('This is an async test error', 500);
}));

// Handle favicon.ico requests to prevent 500 errors on Vercel
app.get('/favicon.ico', (req: Request, res: Response) => res.status(204).end());

// 404 handler
app.use('*', (req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Route not found: ${req.originalUrl}`, 404));
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Health check available at http://0.0.0.0:${PORT}/health`);
  console.log(` Test error handling at http://0.0.0.0:${PORT}/api/test-error`);
  
  // Start the auto-completion scheduler
  startAutoCompletionScheduler();
  console.log('Auto-completion scheduler started (checks every 5 minutes)');
});
export default app;