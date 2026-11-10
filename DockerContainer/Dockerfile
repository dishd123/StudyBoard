# Build the React entry points, then serve the complete static site with Apache.
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM httpd:2.4-alpine
COPY DockerContainer/httpd.conf /usr/local/apache2/conf/httpd.conf
COPY --from=frontend-build /build/dist/ /usr/local/apache2/htdocs/
EXPOSE 80
