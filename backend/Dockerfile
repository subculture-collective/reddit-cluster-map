FROM golang:latest

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY migrations /app/migrations

RUN go build -o main ./cmd/server

EXPOSE 8000
CMD ["./main"]