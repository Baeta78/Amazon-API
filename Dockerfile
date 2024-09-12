# Usar a imagem oficial do Python como base
FROM python:3.9-slim

# Definir o diretório de trabalho
WORKDIR /usr/src/app

# Copiar os arquivos requirements.txt e instalar dependências
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copiar o restante do código da aplicação
COPY . .

# Expor a porta em que a aplicação será executada
EXPOSE 4000

# Comando para rodar a aplicação
CMD ["python", "./app.py"]
