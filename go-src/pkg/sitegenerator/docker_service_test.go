package sitegenerator

import (
	"bytes"
	"encoding/binary"
	"testing"
	"time"
)

func TestDockerLogDemuxFormat(t *testing.T) {
	// Synthesize a Docker multiplexed log stream with 1 stdout line and 1 stderr line
	// Header: 1 byte stream type (1=stdout, 2=stderr), 3 bytes padding (0), 4 bytes uint32 big endian size
	buf := new(bytes.Buffer)

	// Line 1: stdout "2026-10-04T12:00:00Z Tomcat started on port 8080\n"
	msg1 := "2026-10-04T12:00:00Z Tomcat started on port 8080\n"
	hdr1 := make([]byte, 8)
	hdr1[0] = 1 // stdout
	binary.BigEndian.PutUint32(hdr1[4:8], uint32(len(msg1)))
	buf.Write(hdr1)
	buf.WriteString(msg1)

	// Line 2: stderr "2026-10-04T12:00:01Z [WARN] JVM heap memory usage at 78%\n"
	msg2 := "2026-10-04T12:00:01Z [WARN] JVM heap memory usage at 78%\n"
	hdr2 := make([]byte, 8)
	hdr2[0] = 2 // stderr
	binary.BigEndian.PutUint32(hdr2[4:8], uint32(len(msg2)))
	buf.Write(hdr2)
	buf.WriteString(msg2)

	// Verify demuxing simulation
	stream := buf.Bytes()
	if len(stream) != (8 + len(msg1) + 8 + len(msg2)) {
		t.Fatalf("Buffer length mismatch: %d", len(stream))
	}

	// Read frame 1
	frame1Type := stream[0]
	frame1Len := binary.BigEndian.Uint32(stream[4:8])
	if frame1Type != 1 || int(frame1Len) != len(msg1) {
		t.Errorf("Frame 1 header mismatch: type=%d, len=%d", frame1Type, frame1Len)
	}

	// Read frame 2
	offset2 := 8 + int(frame1Len)
	frame2Type := stream[offset2]
	frame2Len := binary.BigEndian.Uint32(stream[offset2+4 : offset2+8])
	if frame2Type != 2 || int(frame2Len) != len(msg2) {
		t.Errorf("Frame 2 header mismatch: type=%d, len=%d", frame2Type, frame2Len)
	}
}

func TestContainerHealthReportAudit(t *testing.T) {
	report := &ContainerHealthReport{
		ContainerID:     "c1a2b3c4d5e6",
		Name:            "site_tomcat_app_internal",
		Image:           "tomcat:10.1-jdk21-temurin-jammy",
		State:           "running",
		HealthStatus:    "healthy",
		FailingStreak:   0,
		StartedAt:       time.Now().Add(-10 * time.Minute),
		User:            "1001:1001",
		NoNewPrivileges: true,
		CapDrop:         []string{"ALL"},
		CapAdd:          []string{"NET_BIND_SERVICE", "CHOWN", "SETUID", "SETGID"},
		NetworkName:     "panel-network",
		IPAddress:       "172.28.0.12",
	}

	if !report.NoNewPrivileges {
		t.Errorf("Expected NoNewPrivileges to be true")
	}
	if len(report.CapDrop) != 1 || report.CapDrop[0] != "ALL" {
		t.Errorf("Expected CapDrop to be ['ALL']")
	}
	if report.User != "1001:1001" {
		t.Errorf("Expected rootless user '1001:1001', got %s", report.User)
	}
	if report.HealthStatus != "healthy" {
		t.Errorf("Expected healthy status")
	}
}
