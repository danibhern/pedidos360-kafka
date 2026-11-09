FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY backend/package*.json backend/
RUN npm ci --prefix backend --no-audit --no-fund
COPY kafka/package*.json kafka/
RUN npm ci --prefix kafka --no-audit --no-fund
COPY local/package*.json local/
RUN npm ci --prefix local --no-audit --no-fund
COPY zookeeper/package*.json zookeeper/
RUN npm ci --prefix zookeeper --no-audit --no-fund
COPY . .
CMD ["node","local/api.cjs"]
