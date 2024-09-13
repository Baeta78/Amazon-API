# Use uma imagem oficial do Node.js como base
FROM node:18-alpine

# Defina o diretório de trabalho dentro do container
WORKDIR /usr/src/app

# Copie o arquivo package.json e package-lock.json para o container
COPY package*.json ./

# Instale as dependências do Node.js
RUN npm install --production

# Copie o restante do código da aplicação
COPY . .

# Expor a porta que a aplicação usará
EXPOSE 4000

# Defina o comando para rodar a aplicação
CMD ["npm", "start"]
