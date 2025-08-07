FROM node:22-slim

WORKDIR /app

# Install OpenSSL (required for Prisma) & curl and clean up in the same layer
RUN apt-get update -y && \
    apt-get install -y openssl curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Copy prisma schema first
COPY prisma ./prisma/

# Install dependencies, generate Prisma client and clean npm cache
RUN npm install && \
    npx prisma generate && \
    npm cache clean --force

# Copy the rest of the application
COPY . .

# Build the TypeScript application and keep only production dependencies
RUN npm run build && \
    npm prune --production

# Expose the port the app runs on
EXPOSE 3000

# Command to run the app
CMD ["npm", "start"]