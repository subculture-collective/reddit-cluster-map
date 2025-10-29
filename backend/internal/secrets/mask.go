package secrets

import "strings"

// Mask returns a masked version of a secret string for safe logging.
// Returns the first 4 characters followed by "..." if the secret is longer than 8 chars,
// otherwise returns "***" to avoid exposing short secrets.
func Mask(secret string) string {
	if secret == "" {
		return ""
	}
	if len(secret) <= 8 {
		return "***"
	}
	return secret[:4] + "..."
}

// MaskURL masks credentials in a URL string (e.g., database connection strings).
// It redacts the password component of URLs like postgres://user:password@host/db
func MaskURL(rawURL string) string {
	if rawURL == "" {
		return ""
	}

	// Find the start of credentials (after ://)
	schemeEnd := strings.Index(rawURL, "://")
	if schemeEnd == -1 {
		return rawURL
	}

	credStart := schemeEnd + 3

	// Find the last @ symbol (in case password contains @)
	atIdx := strings.LastIndex(rawURL, "@")
	if atIdx == -1 || atIdx < credStart {
		return rawURL
	}

	// Find colon separating username from password
	colonIdx := strings.Index(rawURL[credStart:atIdx], ":")
	if colonIdx == -1 {
		// No password, just return as-is
		return rawURL
	}

	// Build masked URL: scheme://user:***@host
	return rawURL[:credStart+colonIdx+1] + "***" + rawURL[atIdx:]
}
