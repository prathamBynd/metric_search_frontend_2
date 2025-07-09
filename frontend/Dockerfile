# ---- Build Stage ------------------------------------------------------------
FROM node:20-alpine AS builder

# Enable pnpm via Corepack (comes with Node 20)
RUN corepack enable && corepack prepare pnpm@9.0.6 --activate

# Allow build-time API base override
ARG NEXT_PUBLIC_FASTAPI_BASE_URL=""
ENV NEXT_PUBLIC_FASTAPI_BASE_URL=${NEXT_PUBLIC_FASTAPI_BASE_URL}

WORKDIR /app

# Copy dependency manifests first (leverages Docker cache)
COPY package.json pnpm-lock.yaml ./

# Install dependencies without generating a lockfile diff
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the Next.js project
RUN pnpm build

# ---- Runtime Stage -----------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Enable pnpm via Corepack in runtime image as well
RUN corepack enable && corepack prepare pnpm@9.0.6 --activate

# Propagate public env var to runtime container (optional but handy for server components)
ARG NEXT_PUBLIC_FASTAPI_BASE_URL=""
ENV NEXT_PUBLIC_FASTAPI_BASE_URL=${NEXT_PUBLIC_FASTAPI_BASE_URL}

# Copy only the built application and the necessary node_modules
COPY --from=builder /app .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Launch Next.js server
CMD ["pnpm", "start"] 