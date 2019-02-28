from node:11

MAINTAINER David Jegat

run mkdir /app
run chown -R 1000:1000 /app

user 1000

workdir /app

cmd yarn --version
