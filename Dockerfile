FROM node:latest as build-stage
WORKDIR /app
COPY ./Client/package*.json ./
RUN npm install -g @quasar/cli && npm install
COPY ./Client/. .
RUN  chmod +x ./ -R
RUN quasar build -m pwa


FROM nginx:1.17.9

WORKDIR /app
COPY ./nginx/default.conf /etc/nginx/conf.d/default.conf
COPY ./nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=build-stage /app/dist/pwa /usr/share/nginx/html


WORKDIR /server
RUN apt-get update && apt-get install curl -y && curl -sL https://deb.nodesource.com/setup_12.x | bash && apt-get install nodejs -y && npm install pm2 -g
COPY ./backend/package*.json ./
RUN npm install --only=production
COPY ./backend ./

EXPOSE 80
CMD (pm2 start /server/index.js) && nginx -g 'daemon off;'