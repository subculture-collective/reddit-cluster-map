FROM golang:1.24.3-bookworm AS builder

WORKDIR /app

# Install PostgreSQL client
RUN apt-get update && \
    apt-get install -y curl gnupg2 && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && \
    apt-get install -y postgresql-client-17 && \
    rm -rf /var/lib/apt/lists/*

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .
COPY migrations /app/migrations
COPY migrations/*.sql /docker-entrypoint-initdb.d/

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# Use a smaller base image for the final container
FROM debian:bookworm-slim

WORKDIR /app

# Install PostgreSQL client
RUN apt-get update && \
    apt-get install -y curl gnupg2 && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && \
    apt-get install -y postgresql-client-17 && \
    rm -rf /var/lib/apt/lists/*

# Copy the binary from builder
COPY --from=builder /app/server .
COPY --from=builder /app/migrations ./migrations

# Expose the internal port the server listens on
EXPOSE 8000

# Run the application
CMD ["./server"]