/**
 * Structured API error types and handling utilities
 */

// Error codes returned by the API
export type ErrorCode =
  // Authentication and authorization errors
  | "AUTH_MISSING"
  | "AUTH_INVALID"
  | "AUTH_FORBIDDEN"
  | "AUTH_OAUTH_NOT_CONFIGURED"
  | "AUTH_OAUTH_FAILED"
  // Graph query and processing errors
  | "GRAPH_TIMEOUT"
  | "GRAPH_QUERY_FAILED"
  | "GRAPH_NO_DATA"
  | "GRAPH_INVALID_PARAMS"
  // Crawl job errors
  | "CRAWL_INVALID_SUBREDDIT"
  | "CRAWL_QUEUE_FAILED"
  | "CRAWL_RATE_LIMITED"
  | "CRAWL_NOT_FOUND"
  // Search operation errors
  | "SEARCH_INVALID_QUERY"
  | "SEARCH_TIMEOUT"
  | "SEARCH_FAILED"
  // System and server errors
  | "SYSTEM_INTERNAL"
  | "SYSTEM_DATABASE"
  | "SYSTEM_UNAVAILABLE"
  | "SYSTEM_TIMEOUT"
  // Validation errors
  | "VALIDATION_INVALID_JSON"
  | "VALIDATION_INVALID_FORMAT"
  | "VALIDATION_MISSING_FIELD"
  | "VALIDATION_INVALID_VALUE"
  // Resource errors
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_CONFLICT"
  // Rate limiting errors
  | "RATE_LIMIT_GLOBAL"
  | "RATE_LIMIT_IP";

// Structured error from API
export interface APIError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  request_id?: string;
}

// Top-level error response
export interface ErrorResponse {
  error: APIError;
}

// Check if an object is a structured error response
export function isErrorResponse(obj: unknown): obj is ErrorResponse {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "error" in obj &&
    typeof (obj as { error: unknown }).error === "object" &&
    (obj as { error: unknown }).error !== null &&
    "code" in (obj as { error: { code: unknown } }).error &&
    "message" in (obj as { error: { message: unknown } }).error
  );
}

// User-friendly error messages for each error code
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Auth errors
  AUTH_MISSING: "Authentication required. Please log in to continue.",
  AUTH_INVALID: "Invalid authentication credentials. Please log in again.",
  AUTH_FORBIDDEN: "You don't have permission to access this resource.",
  AUTH_OAUTH_NOT_CONFIGURED: "OAuth is not configured. Please contact support.",
  AUTH_OAUTH_FAILED: "Authentication failed. Please try again.",

  // Graph errors
  GRAPH_TIMEOUT:
    "Graph query timed out. Try reducing the number of nodes or links.",
  GRAPH_QUERY_FAILED: "Failed to load graph data. Please try again later.",
  GRAPH_NO_DATA: "No graph data available.",
  GRAPH_INVALID_PARAMS: "Invalid graph parameters. Please check your filters.",

  // Crawl errors
  CRAWL_INVALID_SUBREDDIT:
    "Invalid subreddit name. Please check the name and try again.",
  CRAWL_QUEUE_FAILED: "Failed to queue crawl job. Please try again later.",
  CRAWL_RATE_LIMITED: "Too many crawl requests. Please wait and try again.",
  CRAWL_NOT_FOUND: "Crawl job not found.",

  // Search errors
  SEARCH_INVALID_QUERY: "Invalid search query. Please check your input.",
  SEARCH_TIMEOUT: "Search timed out. Please try a more specific query.",
  SEARCH_FAILED: "Search failed. Please try again later.",

  // System errors
  SYSTEM_INTERNAL: "An internal error occurred. Please try again later.",
  SYSTEM_DATABASE: "Database error. Please try again later.",
  SYSTEM_UNAVAILABLE: "Service temporarily unavailable. Please try again later.",
  SYSTEM_TIMEOUT: "Request timed out. Please try again.",

  // Validation errors
  VALIDATION_INVALID_JSON: "Invalid request format.",
  VALIDATION_INVALID_FORMAT: "Invalid request format.",
  VALIDATION_MISSING_FIELD: "Required field is missing.",
  VALIDATION_INVALID_VALUE: "Invalid value provided.",

  // Resource errors
  RESOURCE_NOT_FOUND: "Resource not found.",
  RESOURCE_CONFLICT: "Resource conflict occurred.",

  // Rate limit errors
  RATE_LIMIT_GLOBAL:
    "Too many requests. Please wait a moment and try again.",
  RATE_LIMIT_IP: "Too many requests from your connection. Please wait and try again.",
};

// Error severity levels for UI display
export type ErrorSeverity = "error" | "warning" | "info";

// Get error severity based on error code
export function getErrorSeverity(code: ErrorCode): ErrorSeverity {
  // Rate limits are warnings (temporary)
  if (code.startsWith("RATE_LIMIT_")) return "warning";
  
  // Timeouts are warnings (can retry)
  if (code.includes("TIMEOUT")) return "warning";
  
  // Auth errors that are not missing/invalid are info
  if (code === "AUTH_OAUTH_NOT_CONFIGURED") return "info";
  
  // Everything else is an error
  return "error";
}

// Check if an error is retryable
export function isRetryableError(code: ErrorCode): boolean {
  // Rate limits, timeouts, and system errors are retryable
  return (
    code.startsWith("RATE_LIMIT_") ||
    code.includes("TIMEOUT") ||
    code === "SYSTEM_UNAVAILABLE" ||
    code === "SYSTEM_DATABASE" ||
    code === "SYSTEM_INTERNAL"
  );
}

// Parse error from fetch response
export async function parseAPIError(
  response: Response
): Promise<APIError | null> {
  try {
    const text = await response.text();
    if (!text) return null;

    const json = JSON.parse(text);
    if (isErrorResponse(json)) {
      return json.error;
    }

    // Legacy error format: {"error": "message"}
    if (typeof json === "object" && json !== null && "error" in json) {
      return {
        code: "SYSTEM_INTERNAL",
        message: String(json.error),
      };
    }
  } catch {
    // Not JSON or parsing failed
  }

  return null;
}

// Get user-friendly error message
export function getErrorMessage(error: APIError): string {
  // Use custom message if available, otherwise use default for the code
  return error.message || ERROR_MESSAGES[error.code] || "An error occurred";
}

// Format error for display
export interface DisplayError {
  title: string;
  message: string;
  severity: ErrorSeverity;
  retryable: boolean;
  requestId?: string;
}

export function formatErrorForDisplay(error: APIError): DisplayError {
  const severity = getErrorSeverity(error.code);
  const retryable = isRetryableError(error.code);
  
  // Generate title based on error type
  let title = "Error";
  if (error.code.startsWith("AUTH_")) {
    title = "Authentication Error";
  } else if (error.code.startsWith("GRAPH_")) {
    title = "Graph Error";
  } else if (error.code.startsWith("CRAWL_")) {
    title = "Crawl Error";
  } else if (error.code.startsWith("SEARCH_")) {
    title = "Search Error";
  } else if (error.code.startsWith("RATE_LIMIT_")) {
    title = "Rate Limit";
  } else if (error.code.startsWith("VALIDATION_")) {
    title = "Validation Error";
  }

  return {
    title,
    message: getErrorMessage(error),
    severity,
    retryable,
    requestId: error.request_id,
  };
}

// Helper to handle fetch errors
export async function handleFetchError(
  response: Response,
  fallbackMessage = "An error occurred"
): Promise<string> {
  const apiError = await parseAPIError(response);
  if (apiError) {
    return getErrorMessage(apiError);
  }
  return `HTTP ${response.status}: ${fallbackMessage}`;
}
