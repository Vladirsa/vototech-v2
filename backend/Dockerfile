FROM node:22-slim

WORKDIR /app

# Solo copiar package.json primero — así Docker reutiliza esta capa
# (no reinstala todo node_modules) mientras el código cambie pero
# las dependencias no, que es el caso más común durante desarrollo.
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4000

CMD ["npm", "run", "dev"]
