FROM node:20-alpine

WORKDIR /app/frontend

RUN apk add --no-cache ca-certificates

ENV NEXT_DISABLE_FONT_DOWNLOAD=1

COPY frontend/package.json ./
RUN npm install

COPY frontend ./

# Accept build arguments for Next.js public env vars
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
