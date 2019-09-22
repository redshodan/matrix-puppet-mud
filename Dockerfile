FROM node:12-alpine

RUN mkdir /mud
WORKDIR /mud
ADD package.json /mud/
RUN npm install

ENTRYPOINT [ "node", "index.js" ]
