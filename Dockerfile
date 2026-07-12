FROM node:20-alpine

WORKDIR /app
COPY . .

ENV NODE_ENV=production
ENV DDYS_HOST=0.0.0.0
ENV DDYS_PORT=3219

EXPOSE 3219
CMD ["node", "cli/ddys-alist.mjs", "serve"]
