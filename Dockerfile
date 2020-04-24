FROM node:latest as build-stage
WORKDIR /app
COPY ./Client/package*.json ./
RUN npm install -g @quasar/cli && npm install
COPY ./Client/. .
RUN  chmod +x ./ -R
RUN quasar build -m pwa


FROM nginx:1.17.9
RUN apt-get update && apt-get install curl -y && curl -sL https://deb.nodesource.com/setup_13.x | bash && apt-get install nodejs -y &&  apt-get install build-essential -y && npm install pm2 -g

WORKDIR /app
COPY ./nginx/default.conf /etc/nginx/conf.d/default.conf
COPY ./nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=build-stage /app/dist/pwa /usr/share/nginx/html


WORKDIR /server
COPY ./Server/package*.json ./
RUN npm install --only=production
COPY ./Server ./

CMD nginx && (node /server/index.js)