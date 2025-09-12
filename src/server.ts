import express, { Request, Response, NextFunction } from 'express';
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
import authRoutes from './routes/authRoute';
import jobRoutes from './routes/jobRoute';
import purchaseOrderRoutes from './routes/purchaseOrderRoute';
<<<<<<< Updated upstream
=======
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
import flyingSquadRoutes from './routes/flyingSquadRoute';
import machineAssignmentRoutes from './routes/machineAssignmentRoute';

// Load environment variables

>>>>>>> Stashed changes

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware (apply first)
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(rateLimiter(100, 15 * 60 * 1000)); // 100 requests per 15 minutes
app.use(requestSizeLimiter('10mb'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware
app.use(cookieParser());

// Logging and monitoring middleware
app.use(requestLogger);
app.use(performanceMonitor);

// Input sanitization
app.use(sanitizeInput);

// Routes
app.get('/', (req: Request, res: Response) => {
  res.send({
    message: "Hello World"
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes - Only authentication routes with admin-protected user management
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
<<<<<<< Updated upstream
=======
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
app.use('/api/flying-squad', flyingSquadRoutes);
app.use('/api/machine-assignments', machineAssignmentRoutes);
>>>>>>> Stashed changes

// Test error handling routes
app.get('/api/test-error', (req: Request, res: Response, next: NextFunction) => {
  next(new AppError('This is a test error', 400));
});

app.get('/api/test-async-error', asyncHandler(async (req: Request, res: Response) => {
  throw new AppError('This is an async test error', 500);
}));

// 404 handler
app.use('*', (req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Route not found: ${req.originalUrl}`, 404));
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
  console.log(` Test error handling at http://localhost:${PORT}/api/test-error`);
});

export default app; 