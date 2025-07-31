# Frontend Optimization Guide

## Problem
Your application is making 8 separate API calls on a single page, causing slow loading times and poor user experience.

## Solutions Implemented

### 1. **Aggregated Dashboard Endpoint**

Instead of making 8 separate calls, use a single aggregated endpoint:

```javascript
// ❌ BEFORE: Multiple separate API calls
const loadDashboardData = async () => {
  const jobs = await fetch('/api/jobs');
  const machines = await fetch('/api/machines');
  const jobPlannings = await fetch('/api/job-planning');
  const activityLogs = await fetch('/api/activity-logs');
  const completedJobs = await fetch('/api/completed-jobs');
  const purchaseOrders = await fetch('/api/purchase-orders');
  // ... more calls
};

// ✅ AFTER: Single aggregated call
const loadDashboardData = async () => {
  const response = await fetch('/api/dashboard');
  const data = await response.json();
  
  // All data is now available in a single response
  const { jobs, machines, jobPlannings, activityLogs, completedJobs, purchaseOrders } = data.data;
};
```

### 2. **Job-Specific Aggregated Data**

For job detail pages, use the job-specific aggregated endpoint:

```javascript
// ❌ BEFORE: Multiple calls for job details
const loadJobDetails = async (nrcJobNo) => {
  const job = await fetch(`/api/jobs/${nrcJobNo}`);
  const planning = await fetch(`/api/job-planning/${nrcJobNo}`);
  const corrugation = await fetch(`/api/corrugation/by-job/${nrcJobNo}`);
  const printing = await fetch(`/api/printing-details/by-job/${nrcJobNo}`);
  const punching = await fetch(`/api/punching/by-job/${nrcJobNo}`);
  const quality = await fetch(`/api/quality-dept/by-job/${nrcJobNo}`);
  const dispatch = await fetch(`/api/dispatch-process/by-job/${nrcJobNo}`);
  const sideFlap = await fetch(`/api/side-flap-pasting/by-job/${nrcJobNo}`);
  const fluteLaminate = await fetch(`/api/flute-laminate-board-conversion/by-job/${nrcJobNo}`);
  const paperStore = await fetch(`/api/paper-store/by-job/${nrcJobNo}`);
};

// ✅ AFTER: Single aggregated call
const loadJobDetails = async (nrcJobNo) => {
  const response = await fetch(`/api/dashboard/job/${nrcJobNo}`);
  const data = await response.json();
  
  // All job-related data in one response
  const { job, planning, corrugation, printing, punching, quality, dispatch, sideFlap, fluteLaminate, paperStore } = data.data;
};
```

### 3. **Batch Requests API**

For cases where you need specific data from multiple endpoints:

```javascript
// ❌ BEFORE: Multiple individual requests
const loadSpecificData = async () => {
  const jobs = await fetch('/api/jobs');
  const machines = await fetch('/api/machines');
  const activityLogs = await fetch('/api/activity-logs');
};

// ✅ AFTER: Single batch request
const loadSpecificData = async () => {
  const response = await fetch('/api/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        { method: 'GET', path: '/api/jobs' },
        { method: 'GET', path: '/api/machines' },
        { method: 'GET', path: '/api/activity-logs' }
      ]
    })
  });
  
  const data = await response.json();
  const [jobsResponse, machinesResponse, activityLogsResponse] = data.responses;
};
```

### 4. **React Hook Example**

```javascript
import { useState, useEffect } from 'react';

const useDashboardData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/dashboard');
        const result = await response.json();
        
        if (result.success) {
          setData(result.data);
        } else {
          setError('Failed to fetch dashboard data');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return { data, loading, error };
};

// Usage in component
const Dashboard = () => {
  const { data, loading, error } = useDashboardData();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Dashboard</h1>
      <div>Total Jobs: {data.summary.totalJobs}</div>
      <div>Active Machines: {data.summary.activeMachines}</div>
      {/* Render other data */}
    </div>
  );
};
```

### 5. **Axios Implementation**

```javascript
import axios from 'axios';

// Configure axios with base URL and interceptors
const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// Request interceptor for authentication
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Dashboard service
export const dashboardService = {
  getDashboardData: () => api.get('/dashboard'),
  getJobDetails: (nrcJobNo) => api.get(`/dashboard/job/${nrcJobNo}`),
  batchRequest: (requests) => api.post('/batch', { requests }),
};

// Usage
const loadData = async () => {
  try {
    const response = await dashboardService.getDashboardData();
    return response.data;
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    throw error;
  }
};
```

### 6. **Performance Monitoring**

```javascript
// Performance monitoring utility
const measureApiCall = async (name, apiCall) => {
  const start = performance.now();
  try {
    const result = await apiCall();
    const duration = performance.now() - start;
    console.log(`API Call ${name}: ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(`API Call ${name} failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

// Usage
const loadOptimizedData = async () => {
  return measureApiCall('Dashboard Data', () => 
    fetch('/api/dashboard').then(res => res.json())
  );
};
```

## Expected Performance Improvements

1. **Reduced Network Overhead**: From 8 requests to 1-2 requests
2. **Faster Loading**: Parallel database queries instead of sequential
3. **Better Caching**: Single endpoint can be cached more effectively
4. **Improved User Experience**: Faster page loads and reduced loading states

## Migration Strategy

1. **Phase 1**: Implement aggregated endpoints
2. **Phase 2**: Update frontend to use new endpoints
3. **Phase 3**: Add caching middleware
4. **Phase 4**: Monitor performance and optimize further

## Monitoring

Use the performance monitoring middleware to track:
- Request duration
- Database query performance
- Cache hit rates
- Error rates

The new aggregated endpoints should reduce your page load time from multiple seconds to under 1 second for most use cases. 