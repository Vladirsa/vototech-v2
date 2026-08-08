FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# --host es necesario para que Vite escuche fuera del contenedor,
# no solo en localhost interno (si no, Docker no puede exponerlo)
CMD ["npm", "run", "dev", "--", "--host"]
