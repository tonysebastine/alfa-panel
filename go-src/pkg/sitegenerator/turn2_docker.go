package sitegenerator

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
)

// SiteStatus represents the live container status and resource usage.
type SiteStatus struct {
	Domain        string    `json:"domain"`
	ContainerID   string    `json:"container_id"`
	ContainerName string    `json:"container_name"`
	Status        string    `json:"status"` // "running", "exited", "restarting", "not_found"
	HealthStatus  string    `json:"health_status"` // "healthy", "unhealthy", "starting", "none"
	CpuPercent    float64   `json:"cpu_percent"`
	MemoryUsageMB float64   `json:"memory_usage_mb"`
	MemoryLimitMB float64   `json:"memory_limit_mb"`
	MemoryPercent float64   `json:"memory_percent"`
	PidsCurrent   uint64    `json:"pids_current"`
	StartedAt     time.Time `json:"started_at"`
	ExitCode      int       `json:"exit_code"`
}

// DockerOrchestrator manages container lifecycles via /var/run/docker.sock.
type DockerOrchestrator struct {
	cli        *client.Client
	socketPath string
}

// Global default orchestrator instance
var DefaultDockerOrchestrator *DockerOrchestrator

func init() {
	// Initialize default orchestrator if socket exists
	if _, err := os.Stat("/var/run/docker.sock"); err == nil {
		orch, err := NewDockerOrchestrator("/var/run/docker.sock")
		if err == nil {
			DefaultDockerOrchestrator = orch
		}
	}
}

// NewDockerOrchestrator creates a Docker client with dynamically negotiated API version.
func NewDockerOrchestrator(socketPath string) (*DockerOrchestrator, error) {
	if socketPath == "" {
		socketPath = "/var/run/docker.sock"
	}

	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+socketPath),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}

	return &DockerOrchestrator{
		cli:        cli,
		socketPath: socketPath,
	}, nil
}

// Close releases the client connection.
func (o *DockerOrchestrator) Close() error {
	if o.cli != nil {
		return o.cli.Close()
	}
	return nil
}

// EnsureNetwork creates panel-network (bridge) if it does not already exist.
func (o *DockerOrchestrator) EnsureNetwork(ctx context.Context, networkName string) error {
	if networkName == "" {
		networkName = "panel-network"
	}

	netList, err := o.cli.NetworkList(ctx, network.ListOptions{
		Filters: filters.NewArgs(filters.Arg("name", networkName)),
	})
	if err != nil {
		return fmt.Errorf("failed to list docker networks: %w", err)
	}

	for _, n := range netList {
		if n.Name == networkName {
			return nil // Network already exists
		}
	}

	_, err = o.cli.NetworkCreate(ctx, networkName, network.CreateOptions{
		Driver:     "bridge",
		Attachable: true,
		Internal:   false,
		Labels: map[string]string{
			"managed_by": "1panel-agent",
		},
		Options: map[string]string{
			"com.docker.network.bridge.enable_icc": "true",
		},
	})
	if err != nil {
		return fmt.Errorf("failed to create network %s: %w", networkName, err)
	}

	return nil
}

// ResolveContainerName gets deterministic container name for domain.
func ResolveContainerName(domain string) string {
	slug := strings.ReplaceAll(domain, ".", "_")
	slug = strings.ReplaceAll(slug, "-", "_")
	return slug
}

// StartSite deploys the compose stack: docker compose -f /opt/panel/apps/sites/<domain>/docker-compose.yml up -d
func (o *DockerOrchestrator) StartSite(ctx context.Context, domain string) error {
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return err
	}

	siteDir := filepath.Join(BaseSitesDir, cleanDomain)
	composePath := filepath.Join(siteDir, "docker-compose.yml")
	envPath := filepath.Join(siteDir, ".env")

	if _, err := os.Stat(composePath); err != nil {
		return fmt.Errorf("compose manifest not found at %s: %w", composePath, err)
	}

	// 1. Ensure external panel-network bridge exists
	if err := o.EnsureNetwork(ctx, "panel-network"); err != nil {
		return fmt.Errorf("failed ensuring panel-network: %w", err)
	}

	// 2. Execute docker compose up -d
	cmd := exec.CommandContext(ctx, "docker", "compose",
		"-f", composePath,
		"--env-file", envPath,
		"up", "-d", "--remove-orphans",
	)
	cmd.Dir = siteDir

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker compose up failed: %s (%w)", strings.TrimSpace(string(output)), err)
	}

	return nil
}

// StopSite gracefully stops and tears down the site containers.
func (o *DockerOrchestrator) StopSite(ctx context.Context, domain string) error {
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return err
	}

	siteDir := filepath.Join(BaseSitesDir, cleanDomain)
	composePath := filepath.Join(siteDir, "docker-compose.yml")

	if _, err := os.Stat(composePath); err != nil {
		return fmt.Errorf("compose manifest not found at %s: %w", composePath, err)
	}

	cmd := exec.CommandContext(ctx, "docker", "compose",
		"-f", composePath,
		"down",
	)
	cmd.Dir = siteDir

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker compose down failed: %s (%w)", strings.TrimSpace(string(output)), err)
	}

	return nil
}

// RestartSite triggers a graceful restart of the site stack.
func (o *DockerOrchestrator) RestartSite(ctx context.Context, domain string) error {
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return err
	}

	siteDir := filepath.Join(BaseSitesDir, cleanDomain)
	composePath := filepath.Join(siteDir, "docker-compose.yml")

	cmd := exec.CommandContext(ctx, "docker", "compose",
		"-f", composePath,
		"restart",
	)
	cmd.Dir = siteDir

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker compose restart failed: %s (%w)", strings.TrimSpace(string(output)), err)
	}

	return nil
}

// GetSiteStatus inspects container state (running, exited, memory usage, CPU usage).
func (o *DockerOrchestrator) GetSiteStatus(ctx context.Context, domain string) (SiteStatus, error) {
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return SiteStatus{}, err
	}

	status := SiteStatus{
		Domain: cleanDomain,
		Status: "not_found",
	}

	// Find container matching site slug
	containers, err := o.cli.ContainerList(ctx, container.ListOptions{
		All: true,
	})
	if err != nil {
		return status, fmt.Errorf("failed to list containers: %w", err)
	}

	slug := ResolveContainerName(cleanDomain)
	var targetID string
	var targetName string

	for _, c := range containers {
		for _, name := range c.Names {
			trimmedName := strings.TrimPrefix(name, "/")
			if strings.Contains(trimmedName, slug) {
				targetID = c.ID
				targetName = trimmedName
				break
			}
		}
		if targetID != "" {
			break
		}
	}

	if targetID == "" {
		return status, nil
	}

	// Inspect container
	inspect, err := o.cli.ContainerInspect(ctx, targetID)
	if err != nil {
		return status, fmt.Errorf("failed to inspect container %s: %w", targetID, err)
	}

	status.ContainerID = targetID[:12]
	status.ContainerName = targetName
	status.Status = inspect.State.Status
	status.ExitCode = inspect.State.ExitCode

	if inspect.State.Health != nil {
		status.HealthStatus = inspect.State.Health.Status
	} else {
		status.HealthStatus = "none"
	}

	if t, err := time.Parse(time.RFC3339Nano, inspect.State.StartedAt); err == nil {
		status.StartedAt = t
	}

	// If container is running, calculate live CPU and memory metrics
	if inspect.State.Running {
		statsResp, err := o.cli.ContainerStats(ctx, targetID, false)
		if err == nil {
			defer statsResp.Body.Close()
			var v struct {
				CPUStats struct {
					CPUUsage struct {
						TotalUsage        uint64 `json:"total_usage"`
						PercpuUsage       []uint64
					} `json:"cpu_usage"`
					SystemCPUUsage uint64 `json:"system_cpu_usage"`
					OnlineCPUs     uint32 `json:"online_cpus"`
				} `json:"cpu_stats"`
				PreCPUStats struct {
					CPUUsage struct {
						TotalUsage uint64 `json:"total_usage"`
					} `json:"cpu_usage"`
					SystemCPUUsage uint64 `json:"system_cpu_usage"`
				} `json:"precpu_stats"`
				MemoryStats struct {
					Usage uint64 `json:"usage"`
					Limit uint64 `json:"limit"`
				} `json:"memory_stats"`
				PidsStats struct {
					Current uint64 `json:"current"`
				} `json:"pids_stats"`
			}
			if jsonErr := json.NewDecoder(statsResp.Body).Decode(&v); jsonErr == nil {
				// CPU Calculation
				cpuDelta := float64(v.CPUStats.CPUUsage.TotalUsage) - float64(v.PreCPUStats.CPUUsage.TotalUsage)
				sysDelta := float64(v.CPUStats.SystemCPUUsage) - float64(v.PreCPUStats.SystemCPUUsage)
				cpus := float64(v.CPUStats.OnlineCPUs)
				if cpus == 0 {
					cpus = 1
				}
				if sysDelta > 0 && cpuDelta > 0 {
					status.CpuPercent = (cpuDelta / sysDelta) * cpus * 100.0
				}

				// Memory Calculation
				status.MemoryUsageMB = float64(v.MemoryStats.Usage) / (1024 * 1024)
				status.MemoryLimitMB = float64(v.MemoryStats.Limit) / (1024 * 1024)
				if v.MemoryStats.Limit > 0 {
					status.MemoryPercent = (float64(v.MemoryStats.Usage) / float64(v.MemoryStats.Limit)) * 100.0
				}
				status.PidsCurrent = v.PidsStats.Current
			}
		}
	}

	return status, nil
}

// StreamLogs streams container stdout and stderr for live UI viewing.
func (o *DockerOrchestrator) StreamLogs(ctx context.Context, domain string) (io.ReadCloser, error) {
	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return nil, err
	}

	slug := ResolveContainerName(cleanDomain)
	containers, err := o.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	var targetID string
	for _, c := range containers {
		for _, name := range c.Names {
			if strings.Contains(name, slug) {
				targetID = c.ID
				break
			}
		}
		if targetID != "" {
			break
		}
	}

	if targetID == "" {
		return nil, fmt.Errorf("no container found for domain '%s'", cleanDomain)
	}

	reader, err := o.cli.ContainerLogs(ctx, targetID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Timestamps: true,
		Tail:       "200",
	})
	if err != nil {
		return nil, fmt.Errorf("failed reading container logs: %w", err)
	}

	// Create pipe to demux Docker multiplex format into plaintext reader
	pr, pw := io.Pipe()
	go func() {
		defer pw.Close()
		defer reader.Close()
		_, _ = stdcopy.StdCopy(pw, pw, reader)
	}()

	return pr, nil
}

// ExecInApp executes commands inside the running container (e.g. pip install -r requirements.txt).
func (o *DockerOrchestrator) ExecInApp(ctx context.Context, domain string, cmd []string) (string, error) {
	if len(cmd) == 0 {
		return "", errors.New("command slice cannot be empty")
	}

	cleanDomain, err := SanitizeDomain(domain)
	if err != nil {
		return "", err
	}

	slug := ResolveContainerName(cleanDomain)
	containers, err := o.cli.ContainerList(ctx, container.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list containers: %w", err)
	}

	var targetID string
	for _, c := range containers {
		for _, name := range c.Names {
			if strings.Contains(name, slug) {
				targetID = c.ID
				break
			}
		}
		if targetID != "" {
			break
		}
	}

	if targetID == "" {
		return "", fmt.Errorf("running container not found for domain '%s'", cleanDomain)
	}

	execCfg := container.ExecOptions{
		AttachStdout: true,
		AttachStderr: true,
		Cmd:          cmd,
	}

	execCreate, err := o.cli.ContainerExecCreate(ctx, targetID, execCfg)
	if err != nil {
		return "", fmt.Errorf("failed to create exec: %w", err)
	}

	attach, err := o.cli.ContainerExecAttach(ctx, execCreate.ID, container.ExecStartOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to attach exec: %w", err)
	}
	defer attach.Close()

	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, attach.Reader); err != nil {
		return "", fmt.Errorf("error demuxing output: %w", err)
	}

	inspect, err := o.cli.ContainerExecInspect(ctx, execCreate.ID)
	if err != nil {
		return "", fmt.Errorf("failed to inspect exec: %w", err)
	}

	combined := strings.TrimSpace(stdout.String() + "\n" + stderr.String())
	if inspect.ExitCode != 0 {
		return combined, fmt.Errorf("exec command exited with code %d: %s", inspect.ExitCode, combined)
	}

	return combined, nil
}

// Package-level functions delegating to DefaultDockerOrchestrator if present

func EnsureNetwork(ctx context.Context, networkName string) error {
	if DefaultDockerOrchestrator == nil {
		return errors.New("docker orchestrator is not initialized (check /var/run/docker.sock)")
	}
	return DefaultDockerOrchestrator.EnsureNetwork(ctx, networkName)
}

func StartSite(ctx context.Context, domain string) error {
	if DefaultDockerOrchestrator == nil {
		return errors.New("docker orchestrator is not initialized")
	}
	return DefaultDockerOrchestrator.StartSite(ctx, domain)
}

func StopSite(ctx context.Context, domain string) error {
	if DefaultDockerOrchestrator == nil {
		return errors.New("docker orchestrator is not initialized")
	}
	return DefaultDockerOrchestrator.StopSite(ctx, domain)
}

func RestartSite(ctx context.Context, domain string) error {
	if DefaultDockerOrchestrator == nil {
		return errors.New("docker orchestrator is not initialized")
	}
	return DefaultDockerOrchestrator.RestartSite(ctx, domain)
}

func GetSiteStatus(ctx context.Context, domain string) (SiteStatus, error) {
	if DefaultDockerOrchestrator == nil {
		return SiteStatus{}, errors.New("docker orchestrator is not initialized")
	}
	return DefaultDockerOrchestrator.GetSiteStatus(ctx, domain)
}

func StreamLogs(ctx context.Context, domain string) (io.ReadCloser, error) {
	if DefaultDockerOrchestrator == nil {
		return nil, errors.New("docker orchestrator is not initialized")
	}
	return DefaultDockerOrchestrator.StreamLogs(ctx, domain)
}

func ExecInApp(ctx context.Context, domain string, cmd []string) (string, error) {
	if DefaultDockerOrchestrator == nil {
		return "", errors.New("docker orchestrator is not initialized")
	}
	return DefaultDockerOrchestrator.ExecInApp(ctx, domain, cmd)
}
