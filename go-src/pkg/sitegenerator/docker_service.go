package sitegenerator

import (
	"bufio"
	"context"
	"encoding/binary"
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
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
)

// DefaultDockerSocket defines the standard Linux host Docker daemon Unix socket.
const DefaultDockerSocket = "/var/run/docker.sock"

// DeploymentStage tracks the current phase of bringing up a site.
type DeploymentStage string

const (
	StageInitializing DeploymentStage = "INITIALIZING"
	StageValidating   DeploymentStage = "VALIDATING_CONFIG"
	StageNetworkCheck DeploymentStage = "VERIFYING_NETWORK"
	StagePullingImage DeploymentStage = "PULLING_IMAGE"
	StageCreating     DeploymentStage = "CREATING_CONTAINER"
	StageStarting     DeploymentStage = "STARTING_SERVICES"
	StageHealthCheck  DeploymentStage = "PROBING_HEALTH"
	StageCompleted    DeploymentStage = "COMPLETED"
	StageFailed       DeploymentStage = "FAILED"
)

// DeploymentEvent represents a real-time event during compose up.
type DeploymentEvent struct {
	Timestamp time.Time       `json:"timestamp"`
	Stage     DeploymentStage `json:"stage"`
	Message   string          `json:"message"`
	Progress  int             `json:"progress"` // 0 to 100%
	IsError   bool            `json:"is_error"`
	Details   map[string]any  `json:"details,omitempty"`
}

// LogStreamType indicates stdout or stderr.
type LogStreamType string

const (
	StreamStdout LogStreamType = "stdout"
	StreamStderr LogStreamType = "stderr"
	StreamSystem LogStreamType = "system"
)

// LogEntry encapsulates a single streamed line from the Docker multiplexed log stream.
type LogEntry struct {
	Timestamp time.Time     `json:"timestamp"`
	Stream    LogStreamType `json:"stream"`
	Message   string        `json:"message"`
}

// HealthCheckLogEntry represents a single health probe execution record.
type HealthCheckLogEntry struct {
	Start    time.Time `json:"start"`
	End      time.Time `json:"end"`
	ExitCode int       `json:"exit_code"`
	Output   string    `json:"output"`
}

// ContainerHealthReport contains live status and security audit data from Docker Engine.
type ContainerHealthReport struct {
	ContainerID     string                `json:"container_id"`
	Name            string                `json:"name"`
	Image           string                `json:"image"`
	State           string                `json:"state"` // running, exited, restarting, paused
	HealthStatus    string                `json:"health_status"` // healthy, unhealthy, starting, none
	FailingStreak   int                   `json:"failing_streak"`
	StartedAt       time.Time             `json:"started_at"`
	FinishedAt      time.Time             `json:"finished_at,omitempty"`
	ExitCode        int                   `json:"exit_code"`
	OOMKilled       bool                  `json:"oom_killed"`
	Pid             int                   `json:"pid"`
	User            string                `json:"user"`
	NoNewPrivileges bool                  `json:"no_new_privileges"`
	CapDrop         []string              `json:"cap_drop"`
	CapAdd          []string              `json:"cap_add"`
	IPAddress       string                `json:"ip_address"`
	NetworkName     string                `json:"network_name"`
	PortBindings    []string              `json:"port_bindings"`
	RecentProbes    []HealthCheckLogEntry `json:"recent_probes"`
}

// ContainerResourceStats holds CPU and RAM utilization metrics.
type ContainerResourceStats struct {
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryUsageMB float64 `json:"memory_usage_mb"`
	MemoryLimitMB float64 `json:"memory_limit_mb"`
	MemoryPercent float64 `json:"memory_percent"`
	PidsCurrent   uint64  `json:"pids_current"`
}

// DockerService manages container lifecycle, logs, and health over /var/run/docker.sock.
type DockerService struct {
	cli         *client.Client
	socketPath  string
	networkName string
}

// NewDockerService initializes the Docker client connected to the local Unix domain socket.
func NewDockerService(socketPath string, networkName string) (*DockerService, error) {
	if socketPath == "" {
		socketPath = DefaultDockerSocket
	}
	if networkName == "" {
		networkName = "panel-network"
	}

	// Verify socket existence on Linux host
	if fi, err := os.Stat(socketPath); err != nil {
		return nil, fmt.Errorf("docker socket not accessible at %s: %w", socketPath, err)
	} else if fi.Mode()&os.ModeSocket == 0 {
		return nil, fmt.Errorf("path %s is not a unix domain socket", socketPath)
	}

	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+socketPath),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}

	// Ping Docker daemon to verify socket communication
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := cli.Ping(ctx); err != nil {
		return nil, fmt.Errorf("docker daemon ping failed: %w", err)
	}

	return &DockerService{
		cli:         cli,
		socketPath:  socketPath,
		networkName: networkName,
	}, nil
}

// Close terminates the Docker client session.
func (s *DockerService) Close() error {
	if s.cli != nil {
		return s.cli.Close()
	}
	return nil
}

// EnsureInternalNetwork creates the internal panel-network bridge if it does not already exist.
func (s *DockerService) EnsureInternalNetwork(ctx context.Context) error {
	list, err := s.cli.NetworkList(ctx, network.ListOptions{
		Filters: filters.NewArgs(filters.Arg("name", s.networkName)),
	})
	if err != nil {
		return fmt.Errorf("failed to list docker networks: %w", err)
	}

	for _, n := range list {
		if n.Name == s.networkName {
			return nil // Network already exists
		}
	}

	// Create bridge network isolated for panel containers
	_, err = s.cli.NetworkCreate(ctx, s.networkName, network.CreateOptions{
		Driver:     "bridge",
		Attachable: true,
		Internal:   false, // Allows outbound traffic for package updates/requirements, but no direct host binding
		Labels: map[string]string{
			"com.panel.managed": "true",
			"com.panel.purpose": "internal-ingress-bridge",
		},
		Options: map[string]string{
			"com.docker.network.bridge.enable_icc": "true",
		},
	})
	if err != nil {
		return fmt.Errorf("failed to create bridge network %s: %w", s.networkName, err)
	}

	return nil
}

// BringUpComposeProject activates the site's docker-compose.yml, streaming progress events over a channel.
func (s *DockerService) BringUpComposeProject(ctx context.Context, siteDir string, containerName string) (<-chan DeploymentEvent, error) {
	composeFile := filepath.Join(siteDir, "docker-compose.yml")
	envFile := filepath.Join(siteDir, ".env")

	if _, err := os.Stat(composeFile); err != nil {
		return nil, fmt.Errorf("docker-compose.yml not found in %s", siteDir)
	}
	if _, err := os.Stat(envFile); err != nil {
		return nil, fmt.Errorf(".env file not found in %s", siteDir)
	}

	eventChan := make(chan DeploymentEvent, 32)

	go func() {
		defer close(eventChan)

		sendEvent := func(stage DeploymentStage, msg string, progress int, isErr bool) {
			select {
			case eventChan <- DeploymentEvent{
				Timestamp: time.Now().UTC(),
				Stage:     stage,
				Message:   msg,
				Progress:  progress,
				IsError:   isErr,
			}:
			case <-ctx.Done():
			}
		}

		sendEvent(StageInitializing, fmt.Sprintf("Beginning workload deployment for %s", filepath.Base(siteDir)), 5, false)

		// Step 1: Ensure bridge network
		sendEvent(StageNetworkCheck, fmt.Sprintf("Verifying internal bridge network '%s'", s.networkName), 15, false)
		if err := s.EnsureInternalNetwork(ctx); err != nil {
			sendEvent(StageFailed, fmt.Sprintf("Network provisioning failed: %v", err), 15, true)
			return
		}

		// Step 2: Validate docker-compose syntax
		sendEvent(StageValidating, "Validating Docker Compose configuration syntax", 25, false)
		valCmd := exec.CommandContext(ctx, "docker", "compose", "--project-directory", siteDir, "--env-file", envFile, "config", "--quiet")
		if output, err := valCmd.CombinedOutput(); err != nil {
			sendEvent(StageFailed, fmt.Sprintf("Compose syntax validation failed: %s (%v)", strings.TrimSpace(string(output)), err), 25, true)
			return
		}

		// Step 3: Pull images & launch services
		sendEvent(StageCreating, "Executing docker compose up with rootless security parameters", 45, false)
		upCmd := exec.CommandContext(ctx, "docker", "compose",
			"--project-directory", siteDir,
			"--env-file", envFile,
			"up", "-d", "--remove-orphans",
		)

		stdoutPipe, err := upCmd.StdoutPipe()
		if err != nil {
			sendEvent(StageFailed, fmt.Sprintf("Failed to attach to compose stdout: %v", err), 45, true)
			return
		}
		upCmd.Stderr = upCmd.Stdout

		if err := upCmd.Start(); err != nil {
			sendEvent(StageFailed, fmt.Sprintf("Failed to spawn docker compose: %v", err), 45, true)
			return
		}

		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line != "" {
				sendEvent(StageStarting, line, 65, false)
			}
		}

		if err := upCmd.Wait(); err != nil {
			sendEvent(StageFailed, fmt.Sprintf("Compose deployment exited with error: %v", err), 65, true)
			return
		}

		// Step 4: Health Check Probing
		sendEvent(StageHealthCheck, fmt.Sprintf("Probing container %s health status via Docker API", containerName), 80, false)
		probeSuccess := false
		for i := 0; i < 15; i++ {
			select {
			case <-ctx.Done():
				sendEvent(StageFailed, "Deployment context cancelled during health check wait", 80, true)
				return
			case <-time.After(2 * time.Second):
			}

			report, err := s.InspectContainerHealth(ctx, containerName)
			if err != nil {
				sendEvent(StageHealthCheck, fmt.Sprintf("Awaiting container registration (%v)...", err), 80+(i), false)
				continue
			}

			if report.State != "running" {
				sendEvent(StageFailed, fmt.Sprintf("Container state is '%s' (ExitCode: %d, OOMKilled: %v)", report.State, report.ExitCode, report.OOMKilled), 85, true)
				return
			}

			if report.HealthStatus == "healthy" {
				probeSuccess = true
				break
			} else if report.HealthStatus == "none" {
				// No explicit healthcheck configured, but container is running cleanly
				probeSuccess = true
				break
			} else if report.HealthStatus == "unhealthy" {
				sendEvent(StageFailed, fmt.Sprintf("Health check reported UNHEALTHY state (Streak: %d)", report.FailingStreak), 90, true)
				return
			}

			sendEvent(StageHealthCheck, fmt.Sprintf("Health status: '%s', awaiting probe pass...", report.HealthStatus), 80+i, false)
		}

		if probeSuccess {
			sendEvent(StageCompleted, fmt.Sprintf("Site successfully deployed and running securely on container '%s'", containerName), 100, false)
		} else {
			sendEvent(StageFailed, "Timed out awaiting initial container healthcheck probe", 90, true)
		}
	}()

	return eventChan, nil
}

// StreamContainerLogs reads raw multiplexed Docker logs from the Unix socket and streams demuxed LogEntries over a channel.
func (s *DockerService) StreamContainerLogs(ctx context.Context, containerName string, tailLines int, follow bool) (<-chan LogEntry, <-chan error) {
	logChan := make(chan LogEntry, 100)
	errChan := make(chan error, 1)

	tailStr := "100"
	if tailLines > 0 {
		tailStr = fmt.Sprintf("%d", tailLines)
	}

	opts := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     follow,
		Timestamps: true,
		Tail:       tailStr,
	}

	go func() {
		defer close(logChan)
		defer close(errChan)

		reader, err := s.cli.ContainerLogs(ctx, containerName, opts)
		if err != nil {
			errChan <- fmt.Errorf("failed to open container log stream for %s: %w", containerName, err)
			return
		}
		defer reader.Close()

		// Docker multiplexed stream header:
		// [0]: stream type (1 = stdout, 2 = stderr)
		// [1-3]: unused (0x00)
		// [4-7]: uint32 big endian frame payload size
		header := make([]byte, 8)

		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			_, err := io.ReadFull(reader, header)
			if err != nil {
				if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
					return
				}
				errChan <- fmt.Errorf("error reading log multiplex header: %w", err)
				return
			}

			streamType := StreamStdout
			if header[0] == 2 {
				streamType = StreamStderr
			}

			payloadSize := binary.BigEndian.Uint32(header[4:8])
			payload := make([]byte, payloadSize)
			if _, err := io.ReadFull(reader, payload); err != nil {
				errChan <- fmt.Errorf("error reading log payload (%d bytes): %w", payloadSize, err)
				return
			}

			rawLine := string(payload)
			// Parse timestamp prefix if present: "2026-10-04T12:00:00.000000000Z message"
			var ts time.Time
			var msg string
			parts := strings.SplitN(rawLine, " ", 2)
			if len(parts) == 2 {
				parsedTs, parseErr := time.Parse(time.RFC3339Nano, parts[0])
				if parseErr == nil {
					ts = parsedTs
					msg = strings.TrimRight(parts[1], "\r\n")
				} else {
					ts = time.Now().UTC()
					msg = strings.TrimRight(rawLine, "\r\n")
				}
			} else {
				ts = time.Now().UTC()
				msg = strings.TrimRight(rawLine, "\r\n")
			}

			select {
			case logChan <- LogEntry{
				Timestamp: ts,
				Stream:    streamType,
				Message:   msg,
			}:
			case <-ctx.Done():
				return
			}
		}
	}()

	return logChan, errChan
}

// InspectContainerHealth inspects container security, health probes, and runtime state via Docker Engine API.
func (s *DockerService) InspectContainerHealth(ctx context.Context, containerName string) (*ContainerHealthReport, error) {
	inspect, err := s.cli.ContainerInspect(ctx, containerName)
	if err != nil {
		return nil, fmt.Errorf("failed to inspect container %s: %w", containerName, err)
	}

	report := &ContainerHealthReport{
		ContainerID:     inspect.ID,
		Name:            strings.TrimPrefix(inspect.Name, "/"),
		Image:           inspect.Config.Image,
		State:           inspect.State.Status,
		StartedAt:       time.Time{},
		ExitCode:        inspect.State.ExitCode,
		OOMKilled:       inspect.State.OOMKilled,
		Pid:             inspect.State.Pid,
		User:            inspect.Config.User,
		HealthStatus:    "none",
		RecentProbes:    make([]HealthCheckLogEntry, 0),
	}

	if t, err := time.Parse(time.RFC3339Nano, inspect.State.StartedAt); err == nil {
		report.StartedAt = t
	}
	if t, err := time.Parse(time.RFC3339Nano, inspect.State.FinishedAt); err == nil {
		report.FinishedAt = t
	}

	// Security configurations audit
	if inspect.HostConfig != nil {
		report.CapDrop = inspect.HostConfig.CapDrop
		report.CapAdd = inspect.HostConfig.CapAdd
		for _, opt := range inspect.HostConfig.SecurityOpt {
			if strings.EqualFold(opt, "no-new-privileges:true") || strings.EqualFold(opt, "no-new-privileges") {
				report.NoNewPrivileges = true
			}
		}
	}

	// Health check evaluation
	if inspect.State.Health != nil {
		report.HealthStatus = inspect.State.Health.Status
		report.FailingStreak = inspect.State.Health.FailingStreak

		for _, log := range inspect.State.Health.Log {
			report.RecentProbes = append(report.RecentProbes, HealthCheckLogEntry{
				Start:    log.Start,
				End:      log.End,
				ExitCode: log.ExitCode,
				Output:   strings.TrimSpace(log.Output),
			})
		}
	}

	// Network configuration
	if inspect.NetworkSettings != nil {
		for netName, netEndpoint := range inspect.NetworkSettings.Networks {
			report.NetworkName = netName
			report.IPAddress = netEndpoint.IPAddress
			break
		}
		for port := range inspect.NetworkSettings.Ports {
			report.PortBindings = append(report.PortBindings, string(port))
		}
	}

	return report, nil
}

// StopSite gracefully stops the container workload with a 15-second SIGTERM before SIGKILL.
func (s *DockerService) StopSite(ctx context.Context, containerName string) error {
	timeout := 15
	return s.cli.ContainerStop(ctx, containerName, container.StopOptions{Timeout: &timeout})
}

// RestartSite reboots the container workload.
func (s *DockerService) RestartSite(ctx context.Context, containerName string) error {
	timeout := 15
	return s.cli.ContainerRestart(ctx, containerName, container.StopOptions{Timeout: &timeout})
}

// TeardownSite brings down the compose project and purges container resources.
func (s *DockerService) TeardownSite(ctx context.Context, siteDir string) error {
	composeFile := filepath.Join(siteDir, "docker-compose.yml")
	if _, err := os.Stat(composeFile); err != nil {
		return fmt.Errorf("site compose file not found: %s", composeFile)
	}

	cmd := exec.CommandContext(ctx, "docker", "compose", "--project-directory", siteDir, "down", "--volumes", "--remove-orphans")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to teardown site: %s (%w)", string(out), err)
	}
	return nil
}
