FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG BASE_URL=/
ENV BASE_URL=${BASE_URL}
# Restrict paths to a plain absolute directory, safe for generated nginx config.
RUN node -e 'if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(process.env.BASE_URL)) process.exit(1)'
RUN npm run build
RUN mkdir -p "/site${BASE_URL}" && cp -a dist/. "/site${BASE_URL}" && \
    node --input-type=module -e 'import fs from "node:fs"; let s=fs.readFileSync("nginx.conf","utf8"); const b=process.env.BASE_URL; if(b==="/") s=s.replace(/^    location = __BASE_NO_SLASH__.*\n/m, ""); s=s.replaceAll("__BASE_NO_SLASH__",b.slice(0,-1)).replaceAll("__BASE_URL__",b); fs.writeFileSync("/nginx.conf",s)'

FROM nginx:alpine
COPY --from=build /nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site /usr/share/nginx/html
EXPOSE 80
