package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

type peerCredentialKey struct{}

type peerCredentials struct {
	UID uint32
	GID uint32
	PID int32
}

var expectedAgentPeerUID uint32

func resolveAgentSocketPath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return defaultSocket, nil
	}
	if filepath.Clean(raw) != defaultSocket {
		return "", fmt.Errorf("PANEL_AGENT_SOCKET must be %s; custom socket paths are not permitted", defaultSocket)
	}
	return defaultSocket, nil
}

func validateAgentRuntimeDirectory(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("inspect agent runtime directory: %w", err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || info.Mode().Perm()&0022 != 0 {
		return errors.New("agent runtime directory must be a non-writable-by-group/other directory, not a symlink")
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat.Uid != 0 {
		return errors.New("agent runtime directory must be owned by root")
	}
	return nil
}

func removeStaleAgentSocket(path string) error {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspect existing agent socket: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || info.Mode()&os.ModeSocket == 0 {
		return errors.New("refusing to remove a non-socket or symlink at the agent socket path")
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat.Uid != 0 {
		return errors.New("refusing to remove an agent socket not owned by root")
	}
	conn, dialErr := net.DialTimeout("unix", path, 250*time.Millisecond)
	if dialErr == nil {
		_ = conn.Close()
		return errors.New("an agent is already listening on the configured socket")
	}
	if err := os.Remove(path); err != nil {
		return fmt.Errorf("remove stale agent socket: %w", err)
	}
	return nil
}

func loadAllowedAgentPeerUID() (uint32, error) {
	if raw := strings.TrimSpace(os.Getenv("PANEL_AGENT_ALLOWED_UID")); raw != "" {
		uid, err := strconv.ParseUint(raw, 10, 32)
		if err != nil || uid == 0 {
			return 0, errors.New("PANEL_AGENT_ALLOWED_UID must be a non-root numeric UID")
		}
		return uint32(uid), nil
	}
	apiUser, err := user.Lookup("alfa-panel")
	if err != nil {
		return 0, fmt.Errorf("resolve expected API service account alfa-panel: %w", err)
	}
	uid, err := strconv.ParseUint(apiUser.Uid, 10, 32)
	if err != nil || uid == 0 {
		return 0, errors.New("API service account must have a non-root numeric UID")
	}
	return uint32(uid), nil
}

func agentConnContext(ctx context.Context, conn net.Conn) context.Context {
	unixConn, ok := conn.(*net.UnixConn)
	if !ok {
		return ctx
	}
	raw, err := unixConn.SyscallConn()
	if err != nil {
		return ctx
	}
	var credentials *unix.Ucred
	var socketErr error
	if err := raw.Control(func(fd uintptr) {
		credentials, socketErr = unix.GetsockoptUcred(int(fd), unix.SOL_SOCKET, unix.SO_PEERCRED)
	}); err != nil || socketErr != nil || credentials == nil {
		return ctx
	}
	return context.WithValue(ctx, peerCredentialKey{}, peerCredentials{UID: credentials.Uid, GID: credentials.Gid, PID: credentials.Pid})
}

func authorizedAgentPeer(r *http.Request) bool {
	if expectedAgentPeerUID == 0 {
		return false
	}
	credentials, ok := r.Context().Value(peerCredentialKey{}).(peerCredentials)
	return ok && credentials.UID == expectedAgentPeerUID
}
