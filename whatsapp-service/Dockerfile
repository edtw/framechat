FROM node:20-slim

WORKDIR /app

# Install git for GitHub package dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Create sessions directory
RUN mkdir -p /app/sessions

EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

CMD ["node", "src/index.js"]
