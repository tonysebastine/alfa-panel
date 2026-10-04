package system

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
)

// SystemMetrics encapsulates host health telemetry.
type SystemMetrics struct {
	Timestamp      time.Time   `json:"timestamp"`
	UptimeSeconds  uint64      `json:"uptime_seconds"`
	UptimeHuman    string      `json:"uptime_human"`
	Hostname       string      `json:"hostname"`
	OS             string      `json:"os"`
	Platform       string      `json:"platform"`
	KernelVersion  string      `json:"kernel_version"`
	CPUPercent     float64     `json:"cpu_percent"`
	CPUCount       int         `json:"cpu_count"`
	MemoryTotalMB  float64     `json:"memory_total_mb"`
	MemoryUsedMB   float64     `json:"memory_used_mb"`
	MemoryFreeMB   float64     `json:"memory_free_mb"`
	MemoryPercent  float64     `json:"memory_percent"`
	DiskTotalGB    float64     `json:"disk_total_gb"`
	DiskUsedGB     float64     `json:"disk_used_gb"`
	DiskFreeGB     float64     `json:"disk_free_gb"`
	DiskPercent    float64     `json:"disk_percent"`
	DiskReadBytes  uint64      `json:"disk_read_bytes"`
	DiskWriteBytes uint64      `json:"disk_write_bytes"`
}

// CollectMetrics samples host CPU%, RAM, Disk, and Uptime using gopsutil.
func CollectMetrics(ctx context.Context) (*SystemMetrics, error) {
	metrics := &SystemMetrics{
		Timestamp: time.Now().UTC(),
	}

	// 1. Host Info & Uptime
	if hInfo, err := host.InfoWithContext(ctx); err == nil {
		metrics.UptimeSeconds = hInfo.Uptime
		metrics.Hostname = hInfo.Hostname
		metrics.OS = hInfo.OS
		metrics.Platform = fmt.Sprintf("%s %s", hInfo.Platform, hInfo.PlatformVersion)
		metrics.KernelVersion = hInfo.KernelVersion

		// Format human readable uptime: e.g. "12 days, 4 hours"
		days := hInfo.Uptime / 86400
		hours := (hInfo.Uptime % 86400) / 3600
		mins := (hInfo.Uptime % 3600) / 60
		metrics.UptimeHuman = fmt.Sprintf("%dd %dh %dm", days, hours, mins)
	}

	// 2. CPU Usage
	if percentages, err := cpu.PercentWithContext(ctx, 200*time.Millisecond, false); err == nil && len(percentages) > 0 {
		metrics.CPUPercent = percentages[0]
	}
	if counts, err := cpu.CountsWithContext(ctx, true); err == nil {
		metrics.CPUCount = counts
	}

	// 3. RAM Usage
	if vm, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		metrics.MemoryTotalMB = float64(vm.Total) / (1024 * 1024)
		metrics.MemoryUsedMB = float64(vm.Used) / (1024 * 1024)
		metrics.MemoryFreeMB = float64(vm.Available) / (1024 * 1024)
		metrics.MemoryPercent = vm.UsedPercent
	}

	// 4. Root Disk Usage
	if du, err := disk.UsageWithContext(ctx, "/"); err == nil {
		metrics.DiskTotalGB = float64(du.Total) / (1024 * 1024 * 1024)
		metrics.DiskUsedGB = float64(du.Used) / (1024 * 1024 * 1024)
		metrics.DiskFreeGB = float64(du.Free) / (1024 * 1024 * 1024)
		metrics.DiskPercent = du.UsedPercent
	}

	// 5. Disk I/O Counters
	if ioCounters, err := disk.IOCountersWithContext(ctx); err == nil {
		for _, counter := range ioCounters {
			metrics.DiskReadBytes += counter.ReadBytes
			metrics.DiskWriteBytes += counter.WriteBytes
		}
	}

	return metrics, nil
}

// HandleSystemMetrics handles GET /api/v1/system/metrics.
func HandleSystemMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	metrics, err := CollectMetrics(ctx)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "metrics_collection_failed",
			"message": err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(metrics)
}
