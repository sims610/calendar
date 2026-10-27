ARG NODE_VERSION=24

# Build: compile the TypeScript in src/ to dist/.
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Run: only the compiled code and the packages it needs at runtime.
# Database settings and the push (VAPID) keys come from src/config.js, which CI writes from the
# GitHub secrets.
FROM node:${NODE_VERSION}-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /usr/src/app/dist ./dist
EXPOSE 80
CMD ["node", "dist/index.js", "80"]
