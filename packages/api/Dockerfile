FROM node:20-alpine

WORKDIR /app

# Copy the entire project (including pre-installed node_modules, pre-compiled artifacts, and built API JS files)
COPY . .

EXPOSE 8000

# Start Express server
CMD ["npm", "start", "--prefix", "packages/api"]
