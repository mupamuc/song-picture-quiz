FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY songs.json game.mjs room.mjs audio.mjs ./
COPY server/server.mjs ./server/server.mjs
USER node
ENV HOST=0.0.0.0 PORT=8102
EXPOSE 8102
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/server.mjs"]
