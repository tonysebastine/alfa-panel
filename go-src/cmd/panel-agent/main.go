package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/panel/panel-agent/pkg/sitegenerator"
)

func main() {
	var (
		domain       = flag.String("domain", "", "Site domain name (e.g. api.example.com)")
		siteType     = flag.String("type", "tomcat", "Site runtime type: 'tomcat' or 'python'")
		baseDir      = flag.String("base-dir", "/opt/panel/apps/sites", "Base directory for sites")
		cpuLimit     = flag.String("cpu", "1.5", "CPU quota limit (e.g. 1.5)")
		memoryLimit  = flag.String("memory", "2048M", "RAM memory limit (e.g. 2048M)")
		jvmMaxHeap   = flag.String("jvm-max", "1536m", "Tomcat JVM Max Heap -Xmx")
		pythonRunner = flag.String("runner", "gunicorn", "Python runner: 'gunicorn' or 'uvicorn'")
		pythonApp    = flag.String("app", "main:app", "Python module entrypoint (e.g. main:app)")
		dryRun       = flag.Bool("dry-run", false, "Preview generation without touching host filesystem")
		outputJSON   = flag.Bool("json", false, "Output results in JSON format")
	)
	flag.Parse()

	if *domain == "" {
		fmt.Fprintf(os.Stderr, "Error: --domain flag is required\n\n")
		flag.Usage()
		os.Exit(1)
	}

	st := sitegenerator.SiteType(*siteType)
	if st != sitegenerator.SiteTypeTomcat && st != sitegenerator.SiteTypePython {
		fmt.Fprintf(os.Stderr, "Error: unsupported type '%s'. Must be 'tomcat' or 'python'\n", *siteType)
		os.Exit(1)
	}

	cfg := sitegenerator.NewSiteConfig(*domain, st)
	cfg.BaseDir = *baseDir
	cfg.Resources.CPULimit = *cpuLimit
	cfg.Resources.MemoryLimit = *memoryLimit

	if st == sitegenerator.SiteTypeTomcat {
		cfg.Tomcat.MaxHeap = *jvmMaxHeap
	} else {
		cfg.Python.Runner = sitegenerator.PythonRunner(*pythonRunner)
		cfg.Python.AppModule = *pythonApp
	}

	gen := sitegenerator.NewGenerator(*dryRun)
	res, err := gen.GenerateSite(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Generation Error: %v\n", err)
		os.Exit(1)
	}

	if *outputJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(res); err != nil {
			fmt.Fprintf(os.Stderr, "JSON encoding error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	fmt.Printf("\n=======================================================\n")
	fmt.Printf("   1PANEL SITE GENERATOR - SUMMARY\n")
	fmt.Printf("=======================================================\n")
	fmt.Printf("Status:           SUCCESS\n")
	fmt.Printf("Domain:           %s\n", cfg.Domain)
	fmt.Printf("Type:             %s\n", cfg.Type)
	fmt.Printf("Site Directory:   %s\n", res.SitePath)
	fmt.Printf("Docker Compose:   %s\n", res.ComposePath)
	fmt.Printf("Environment File: %s\n", res.EnvPath)
	fmt.Printf("Proxy Ingress:    %s\n", res.ProxyConfigPath)
	fmt.Printf("Container Name:   %s\n", res.ContainerName)
	fmt.Printf("Internal Network: %s (No direct host ports bound)\n", cfg.NetworkName)
	fmt.Printf("Security Mode:    Rootless UID:%d GID:%d (no-new-privileges, CapDrop: ALL)\n",
		cfg.Security.UID, cfg.Security.GID)

	fmt.Printf("\n--- Verification & Activation Commands ---\n")
	for i, cmd := range res.VerificationCmds {
		fmt.Printf("[%d] %s\n", i+1, cmd)
	}
	fmt.Printf("=======================================================\n\n")
}
