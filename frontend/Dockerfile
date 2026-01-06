FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY package.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
