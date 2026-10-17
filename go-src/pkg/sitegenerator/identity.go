package sitegenerator

import (
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// RuntimeIdentity reads the configured identity from Docker's trusted container
// metadata. It deliberately does not parse the customer-writable .env file.
func RuntimeIdentity(domain string) (int, int, error) {
	clean, err := SanitizeDomain(domain)
	if err != nil {
		return 0, 0, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	container := ResolveContainerName(clean)
	output, err := exec.CommandContext(ctx, "docker", "inspect", "--format", "{{.Config.User}}", container).Output()
	if err != nil {
		return 0, 0, fmt.Errorf("unable to verify runtime identity from container metadata")
	}
	parts := strings.Split(strings.TrimSpace(string(output)), ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("container runtime identity must specify UID and GID")
	}
	uid, err := strconv.Atoi(parts[0])
	if err != nil || uid < 1000 {
		return 0, 0, fmt.Errorf("container UID is invalid or privileged")
	}
	gid, err := strconv.Atoi(parts[1])
	if err != nil || gid < 1000 {
		return 0, 0, fmt.Errorf("container GID is invalid or privileged")
	}
	return uid, gid, nil
}
