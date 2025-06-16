# Node.js TypeScript Server with Role-Based Authentication

A robust Node.js server built with TypeScript and Express.js, featuring comprehensive role-based authentication, security middleware, and PostgreSQL database integration.

## Features

- ✅ TypeScript support with strict configuration
- ✅ Express.js framework with organized routing
- ✅ **Role-based authentication** with JWT tokens
- ✅ **PostgreSQL database** with Prisma ORM
- ✅ **5 User Roles**: Admin, Planner, Production Head, Dispatch Executive, QC Manager
- ✅ Comprehensive error handling with custom error classes
- ✅ Security middleware (CORS, rate limiting, security headers)
- ✅ Request logging and performance monitoring
- ✅ Input validation and sanitization
- ✅ Async/await error handling wrapper
- ✅ Health check endpoint with system metrics
- ✅ Modular middleware architecture
- ✅ Development and production scripts

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database
- npm or yarn

## Installation

1. Clone or download this project
2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp env.example .env
   ```

   Edit `.env` file with your database credentials:

   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/your_database_name?schema=public"
   JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
   JWT_EXPIRES_IN="7d"
   PORT=3000
   NODE_ENV=development
   ```

4. Set up the database:

   ```bash
   # Generate Prisma client
   npm run db:generate

   # Push schema to database
   npm run db:push

   # Or create migration
   npm run db:migrate
   ```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run watch` - Start development server with file watching
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server (requires build first)
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Create and apply database migrations
- `npm run db:studio` - Open Prisma Studio for database management

## Development

To start the development server:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Project Structure

```
├── src/
│   ├── middleware/
│   │   ├── errorHandler.ts    # Error handling and async wrapper
│   │   ├── logger.ts          # Request logging and performance monitoring
│   │   ├── security.ts        # Security headers, CORS, rate limiting
│   │   ├── validation.ts      # Input validation and sanitization
│   │   ├── auth.ts            # JWT authentication and authorization
│   │   └── index.ts           # Middleware exports
│   ├── routes/
│   │   ├── auth.ts            # Authentication routes
│   │   └── users.ts           # User API routes
│   ├── services/
│   │   └── authService.ts     # Authentication business logic
│   ├── types/
│   │   └── user.ts            # TypeScript types and interfaces
│   ├── lib/
│   │   └── prisma.ts          # Prisma client instance
│   └── server.ts              # Main server file
├── prisma/
│   └── schema.prisma          # Database schema
├── dist/                      # Compiled JavaScript (generated)
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
└── README.md                  # This file
```

## User Roles

The system supports 5 different user roles:

- **admin** - Full system access, can manage all users
- **planner** - Planning and scheduling access
- **production_head** - Production management access
- **dispatch_executive** - Dispatch and logistics access
- **qc_manager** - Quality control management access

## Authentication API

### POST /api/auth/login

Login with email and password.

**Request Body:**

```json
{
  "email": "admin@example.com",
  "password": "yourpassword"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user_id",
      "email": "admin@example.com",
      "role": "admin",
      "firstName": "John",
      "lastName": "Doe",
      "isActive": true,
      "lastLogin": "2024-01-01T12:00:00.000Z",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    },
    "token": "jwt_token_here",
    "expiresIn": 604800
  }
}
```

### GET /api/auth/profile

Get current user profile (requires authentication).

**Headers:**

```
Authorization: Bearer <jwt_token>
```

### POST /api/auth/add-member

Add new member (admin only).

**Headers:**

```
Authorization: Bearer <admin_jwt_token>
```

**Request Body:**

```json
{
  "email": "newuser@example.com",
  "password": "securepassword",
  "role": "planner",
  "firstName": "Jane",
  "lastName": "Smith"
}
```

### GET /api/auth/users

Get all users (admin only).

### GET /api/auth/users/:id

Get user by ID (admin only).

### PUT /api/auth/users/:id

Update user (admin only).

### DELETE /api/auth/users/:id

Delete user (admin only).

### GET /api/auth/roles

Get available roles (public endpoint).

## Protected Routes

All admin-only endpoints require:

1. **Valid JWT token** in Authorization header
2. **Admin role** in the token

Example protected request:

```bash
curl -X POST http://localhost:3000/api/auth/add-member \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "securepassword",
    "role": "planner"
  }'
```

## Database Schema

The system uses PostgreSQL with the following User model:

```prisma
enum UserRole {
  admin
  planner
  production_head
  dispatch_executive
  qc_manager
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  role      UserRole
  firstName String?
  lastName  String?
  isActive  Boolean  @default(true)
  lastLogin DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Security Features

- **JWT Authentication** with configurable expiration
- **Password Hashing** using bcryptjs
- **Role-based Authorization** with middleware
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Security Headers**: XSS protection, content type options, frame options
- **CORS**: Configurable allowed origins
- **Input Sanitization**: Removes potentially malicious content
- **Request Size Limiting**: Prevents large payload attacks

## Error Handling

The server includes comprehensive error handling:

- **400 Bad Request** - Invalid input data
- **401 Unauthorized** - Authentication required or invalid credentials
- **403 Forbidden** - Insufficient permissions
- **404 Not Found** - Resource not found
- **429 Too Many Requests** - Rate limit exceeded
- **500 Internal Server Error** - Server errors

All errors return a consistent format:

```json
{
  "success": false,
  "error": "Error message",
  "stack": "Error stack trace (development only)"
}
```

## Testing the API

### 1. Login as Admin

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "adminpassword"
  }'
```

### 2. Add New Member (Admin Only)

```bash
curl -X POST http://localhost:3000/api/auth/add-member \
  -H "Authorization: Bearer <token_from_login>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "planner@example.com",
    "password": "planner123",
    "role": "planner",
    "firstName": "Jane",
    "lastName": "Planner"
  }'
```

### 3. Get All Users (Admin Only)

```bash
curl -X GET http://localhost:3000/api/auth/users \
  -H "Authorization: Bearer <token_from_login>"
```

### 4. Get User Profile

```bash
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer <token_from_login>"
```

## Building for Production

1. Build the TypeScript code:

   ```bash
   npm run build
   ```

2. Set up production environment variables

3. Start the production server:
   ```bash
   npm start
   ```

## License

MIT
