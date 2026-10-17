package sitegenerator

import (
	"os"
	"path/filepath"
	"testing"
)

func installFakeDocker(t *testing.T, output string, exitCode int) {
	t.Helper()
	dir := t.TempDir()
	script := "#!/bin/sh\n"
	if exitCode == 0 {
		script += "printf '%s' \"$MOCK_DOCKER_USER\"\n"
	} else {
		script += "exit 1\n"
	}
	if err := os.WriteFile(filepath.Join(dir, "docker"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("MOCK_DOCKER_USER", output)
}

func TestRuntimeIdentityUsesContainerMetadata(t *testing.T) {
	installFakeDocker(t, "1234:2345", 0)
	uid, gid, err := RuntimeIdentity("app.example.com")
	if err != nil {
		t.Fatal(err)
	}
	if uid != 1234 || gid != 2345 {
		t.Fatalf("identity = %d:%d, want 1234:2345", uid, gid)
	}
}

func TestRuntimeIdentityRejectsRootAndMalformedMetadata(t *testing.T) {
	for _, value := range []string{"0:0", "1001", "abc:1001", "1001:0"} {
		t.Run(value, func(t *testing.T) {
			installFakeDocker(t, value, 0)
			if _, _, err := RuntimeIdentity("app.example.com"); err == nil {
				t.Fatalf("expected invalid identity %q to be rejected", value)
			}
		})
	}
}

func TestRuntimeIdentityFailsClosedWhenContainerCannotBeInspected(t *testing.T) {
	installFakeDocker(t, "", 1)
	if _, _, err := RuntimeIdentity("app.example.com"); err == nil {
		t.Fatal("expected container inspection failure")
	}
}
