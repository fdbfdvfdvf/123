FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY web ./web
RUN npm install --omit=dev
ENV PORT=3000 NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/index.js"]
