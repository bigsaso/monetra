FROM node:20-alpine

WORKDIR /app/frontend

RUN apk add --no-cache ca-certificates

ENV NEXT_DISABLE_FONT_DOWNLOAD=1

COPY frontend/package.json ./
RUN npm install

COPY frontend ./
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
