FROM node:12

EXPOSE 7005
CMD ["node", "example/index.js"]

RUN apt-get update && apt-get install git \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && git clone https://github.com/gabrielcsapo/node-git-server.git \
    && cd node-git-server \
    && npm link

WORKDIR node-git-server
VOLUME /node-git-server/example/tmp
