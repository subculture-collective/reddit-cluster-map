FROM golang:latest

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY migrations /app/migrations
COPY migrations/schema.sql /docker-entrypoint-initdb.d/migrations/schema.sql

RUN go build -o main ./cmd/server

EXPOSE 8000
CMD ["./main"]