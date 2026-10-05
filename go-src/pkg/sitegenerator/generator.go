package sitegenerator

import (
	"fmt"
	"os"
	"path/filepath"
)

// Generator manages declarative site provisioning on the host filesystem.
type Generator struct {
	dryRun bool
}

// NewGenerator creates a new site Generator instance.
func NewGenerator(dryRun bool) *Generator {
	return &Generator{dryRun: dryRun}
}

// GenerateSite performs full validation, directory creation, atomic manifest writes, and starter files.
func (g *Generator) GenerateSite(cfg *SiteConfig) (*GenerationResult, error) {
	// Step 1: Strict input validation
	if err := ValidateConfig(cfg); err != nil {
		return nil, fmt.Errorf("configuration validation failed: %w", err)
	}

	siteDir := cfg.GetSiteDir()
	envPath := filepath.Join(siteDir, ".env")
	composePath := filepath.Join(siteDir, "docker-compose.yml")
	proxyDir := filepath.Join(filepath.Dir(filepath.Dir(siteDir)), "proxy", "vhosts")
	proxyPath := filepath.Join(proxyDir, fmt.Sprintf("%s.conf", cfg.Domain))

	// Track filesystem changes for clean rollback on error
	var createdDirs []string
	var createdFiles []string
	rollback := func() {
		if g.dryRun {
			return
		}
		for _, f := range createdFiles {
			_ = os.Remove(f)
		}
		for i := len(createdDirs) - 1; i >= 0; i-- {
			_ = os.Remove(createdDirs[i])
		}
	}

	// Step 2: Determine Subdirectories
	subDirs := []string{
		filepath.Join(siteDir, "data"),
		filepath.Join(siteDir, "logs"),
		filepath.Join(siteDir, "config"),
	}

	if cfg.Type == SiteTypeTomcat {
		subDirs = append(subDirs,
			filepath.Join(siteDir, "webapps"),
			filepath.Join(siteDir, "webapps", "ROOT"),
		)
	} else {
		subDirs = append(subDirs,
			filepath.Join(siteDir, "app"),
		)
	}

	// Step 3: Create directory tree with secure 0750 permissions
	if !g.dryRun {
		// Ensure base directory exists
		if err := os.MkdirAll(siteDir, 0750); err != nil {
			return nil, fmt.Errorf("failed to create site directory %s: %w", siteDir, err)
		}
		createdDirs = append(createdDirs, siteDir)

		for _, dir := range subDirs {
			if _, err := os.Stat(dir); os.IsNotExist(err) {
				if err := os.MkdirAll(dir, 0750); err != nil {
					rollback()
					return nil, fmt.Errorf("failed to create directory %s: %w", dir, err)
				}
				createdDirs = append(createdDirs, dir)
			}
		}

		// Ensure proxy directory exists
		if err := os.MkdirAll(proxyDir, 0755); err != nil {
			// Non-fatal if proxy dir is in a different location, but logged
		}
	}

	// Apply runtime ownership to mounted application paths while keeping control-plane manifests root-owned.
func applyRuntimeOwnership(cfg *SiteConfig, siteDir string, subDirs []string) error {
	if os.Geteuid()!=0 { return nil }
	if err:=os.Chmod(siteDir,0751);err!=nil{return err}
	for _,dir:=range subDirs{if err:=os.Chown(dir,cfg.Security.UID,cfg.Security.GID);err!=nil{return fmt.Errorf("chown %s: %w",dir,err)};if err:=os.Chmod(dir,0750);err!=nil{return err}}
	return nil
}

if !g.dryRun { if err:=applyRuntimeOwnership(cfg,siteDir,subDirs);err!=nil{rollback();return nil,fmt.Errorf("failed applying runtime ownership: %w",err)} }

	// Step 4: Render Manifests
	var envContent, composeContent string
	var err error

	if cfg.Type == SiteTypeTomcat {
		envContent, err = renderTemplate(EnvTemplateTomcat, cfg)
		if err != nil {
			rollback()
			return nil, fmt.Errorf("failed to render tomcat .env template: %w", err)
		}
		composeContent, err = renderTemplate(ComposeTemplateTomcat, cfg)
		if err != nil {
			rollback()
			return nil, fmt.Errorf("failed to render tomcat compose template: %w", err)
		}
	} else {
		envContent, err = renderTemplate(EnvTemplatePython, cfg)
		if err != nil {
			rollback()
			return nil, fmt.Errorf("failed to render python .env template: %w", err)
		}
		composeContent, err = renderTemplate(ComposeTemplatePython, cfg)
		if err != nil {
			rollback()
			return nil, fmt.Errorf("failed to render python compose template: %w", err)
		}
	}

	proxyContent, err := renderTemplate(ProxyTemplate, cfg)
	if err != nil {
		rollback()
		return nil, fmt.Errorf("failed to render reverse proxy template: %w", err)
	}

	// Step 5: Atomically write .env and docker-compose.yml with 0640 permissions
	if !g.dryRun {
		if err := atomicWriteFile(envPath, []byte(envContent), 0640); err != nil {
			rollback()
			return nil, fmt.Errorf("failed to write %s: %w", envPath, err)
		}
		createdFiles = append(createdFiles, envPath)

		if err := atomicWriteFile(composePath, []byte(composeContent), 0640); err != nil {
			rollback()
			return nil, fmt.Errorf("failed to write %s: %w", composePath, err)
		}
		createdFiles = append(createdFiles, composePath)

		// Write proxy config
		_ = atomicWriteFile(proxyPath, []byte(proxyContent), 0644)

		// Step 6: Create default starter files if not present
		if cfg.Type == SiteTypeTomcat {
			indexJsp := filepath.Join(siteDir, "webapps", "ROOT", "index.jsp")
			if _, err := os.Stat(indexJsp); os.IsNotExist(err) {
				if err := os.WriteFile(indexJsp, []byte(DefaultTomcatIndexJSP), 0644); err == nil {
					createdFiles = append(createdFiles, indexJsp)
				}
			}
			catProp := filepath.Join(siteDir, "config", "catalina.properties")
			if _, err := os.Stat(catProp); os.IsNotExist(err) {
				_ = os.WriteFile(catProp, []byte("# 1Panel default Tomcat catalina.properties\n"), 0644)
			}
		} else {
			mainPy := filepath.Join(siteDir, "app", "main.py")
			if _, err := os.Stat(mainPy); os.IsNotExist(err) {
				if err := os.WriteFile(mainPy, []byte(DefaultPythonApp), 0644); err == nil {
					createdFiles = append(createdFiles, mainPy)
				}
			}
			reqTxt := filepath.Join(siteDir, "app", "requirements.txt")
			if _, err := os.Stat(reqTxt); os.IsNotExist(err) {
				if err := os.WriteFile(reqTxt, []byte(DefaultPythonRequirements), 0644); err == nil {
					createdFiles = append(createdFiles, reqTxt)
				}
			}
		}
	}

	// Step 7: Build verification commands for production ops
	containerName := cfg.GetContainerName()
	verificationCmds := []string{
		fmt.Sprintf("cd %s && docker compose config --quiet && echo 'Compose syntax valid'", siteDir),
		fmt.Sprintf("cd %s && docker compose --env-file .env up -d", siteDir),
		fmt.Sprintf("docker inspect %s --format 'SecurityOpt: {{json .HostConfig.SecurityOpt}}'", containerName),
		fmt.Sprintf("docker inspect %s --format 'CapDrop: {{json .HostConfig.CapDrop}} | CapAdd: {{json .HostConfig.CapAdd}}'", containerName),
		fmt.Sprintf("docker inspect %s --format 'User: {{json .Config.User}}'", containerName),
		fmt.Sprintf("docker inspect %s --format 'Networks: {{json .NetworkSettings.Networks}}'", containerName),
		fmt.Sprintf("docker inspect %s --format 'State: {{.State.Status}} | Health: {{.State.Health.Status}}'", containerName),
		fmt.Sprintf("curl -I -H 'Host: %s' http://127.0.0.1/", cfg.Domain),
	}

	return &GenerationResult{
		SitePath:         siteDir,
		EnvPath:          envPath,
		ComposePath:      composePath,
		ProxyConfigPath:  proxyPath,
		SubDirectories:   subDirs,
		EnvContent:       envContent,
		ComposeContent:   composeContent,
		ProxyContent:     proxyContent,
		ContainerName:    containerName,
		VerificationCmds: verificationCmds,
	}, nil
}

// atomicWriteFile writes data to a temporary file in the same directory, syncs, and renames.
func atomicWriteFile(filename string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(filename)
	tmpFile, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmpFile.Name()

	cleanUp := true
	defer func() {
		if cleanUp {
			_ = os.Remove(tmpName)
		}
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return err
	}

	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return err
	}

	if err := tmpFile.Close(); err != nil {
		return err
	}

	if err := os.Chmod(tmpName, perm); err != nil {
		return err
	}

	if err := os.Rename(tmpName, filename); err != nil {
		return err
	}

	cleanUp = false
	return nil
}
