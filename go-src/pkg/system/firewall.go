package system

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

// FirewallAction represents ALLOW or DENY.
type FirewallAction string

const (
	ActionAllow FirewallAction = "ALLOW"
	ActionDeny  FirewallAction = "DENY"
)

// FirewallRule represents a parsed host firewall rule.
type FirewallRule struct {
	ID       int            `json:"id"`
	Port     int            `json:"port"`
	Protocol string         `json:"protocol"` // "tcp", "udp", "any"
	Action   FirewallAction `json:"action"`   // "ALLOW", "DENY"
	FromIP   string         `json:"from_ip"`  // "Anywhere", "0.0.0.0/0", or specific CIDR
	Comment  string         `json:"comment"`
}

// FirewallManager executes host firewall operations safely via exec.CommandContext.
type FirewallManager struct {
	backend string // "ufw" or "nftables"
}

// NewFirewallManager detects whether ufw or nftables is available on the Linux host.
func NewFirewallManager() *FirewallManager {
	if _, err := exec.LookPath("ufw"); err == nil {
		return &FirewallManager{backend: "ufw"}
	}
	if _, err := exec.LookPath("nft"); err == nil {
		return &FirewallManager{backend: "nftables"}
	}
	return &FirewallManager{backend: "unsupported"}
}

func (fm *FirewallManager) Backend() string {
	if fm == nil || fm.backend == "" {
		return "unsupported"
	}
	return fm.backend
}

func (fm *FirewallManager) MutationsEnabled() bool {
	if fm == nil {
		return false
	}
	if fm.backend == "ufw" {
		return true
	}
	return fm.backend == "nftables" && strings.EqualFold(strings.TrimSpace(os.Getenv("PANEL_NFTABLES_MUTATIONS_ENABLED")), "true")
}

// sanitizeComment strips dangerous shell escapes from comment fields.
func sanitizeComment(comment string) string {
	comment = strings.TrimSpace(comment)
	re := regexp.MustCompile(`[^a-zA-Z0-9_\-\. ]`)
	clean := re.ReplaceAllString(comment, "")
	if len(clean) > 64 {
		return clean[:64]
	}
	return clean
}

// ListRules retrieves numbered rules from the host firewall.
func (fm *FirewallManager) ListRules(ctx context.Context) ([]FirewallRule, error) {
	if fm == nil {
		return nil, fmt.Errorf("firewall manager is unavailable")
	}
	if fm.backend == "unsupported" {
		return nil, fmt.Errorf("no supported firewall backend (ufw or nft) is installed")
	}
	if fm.backend == "ufw" {
		cmd := exec.CommandContext(ctx, "ufw", "status", "numbered")
		out, err := cmd.CombinedOutput()
		if err != nil {
			return nil, fmt.Errorf("failed listing ufw rules: %s (%w)", string(out), err)
		}
		return parseUFWNumberedOutput(string(out)), nil
	}

	// nftables parser fallback
	cmd := exec.CommandContext(ctx, "nft", "-j", "list", "ruleset")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed listing nftables rules: %s (%w)", string(out), err)
	}
	out, err = exec.CommandContext(ctx, "nft", "-a", "list", "chain", "inet", "filter", "input").CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed listing nftables input chain: %s (%w)", string(out), err)
	}
	return parseNFTOutput(string(out)), nil
}

// AllowPort opens a port on the host firewall: ufw allow <port>/<proto> comment '<comment>'
func (fm *FirewallManager) AllowPort(ctx context.Context, port int, proto string, comment string) error {
	if fm == nil || fm.backend == "unsupported" {
		return fmt.Errorf("firewall changes are unavailable: no supported backend")
	}
	if port < 1 || port > 65535 {
		return fmt.Errorf("port out of range (1-65535): %d", port)
	}

	proto = strings.ToLower(strings.TrimSpace(proto))
	if proto == "" {
		proto = "tcp"
	}
	if proto != "tcp" && proto != "udp" && proto != "any" {
		return fmt.Errorf("unsupported protocol '%s' (must be 'tcp', 'udp', or 'any')", proto)
	}

	cleanComment := sanitizeComment(comment)
	if cleanComment == "" {
		cleanComment = fmt.Sprintf("1Panel Managed Port %d", port)
	}

	var cmd *exec.Cmd
	if fm.backend == "ufw" {
		ruleSpec := fmt.Sprintf("%d/%s", port, proto)
		if proto == "any" {
			ruleSpec = fmt.Sprintf("%d", port)
		}
		cmd = exec.CommandContext(ctx, "ufw", "allow", ruleSpec, "comment", cleanComment)
	} else {
		// nftables rule addition
		if err := fm.ensureNFTInputChain(ctx); err != nil {
			return err
		}
		if proto == "any" {
			for _, p := range []string{"tcp", "udp"} {
				if err := fm.nftRule(ctx, p, port, "accept"); err != nil {
					return err
				}
			}
			return nil
		}
		return fm.nftRule(ctx, proto, port, "accept")
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("firewall allow command failed: %s (%w)", string(out), err)
	}

	return nil
}

// DenyPort closes a port on the host firewall.
func (fm *FirewallManager) DenyPort(ctx context.Context, port int, proto string) error {
	if fm == nil || fm.backend == "unsupported" {
		return fmt.Errorf("firewall changes are unavailable: no supported backend")
	}
	if port < 1 || port > 65535 {
		return fmt.Errorf("port out of range (1-65535): %d", port)
	}

	proto = strings.ToLower(strings.TrimSpace(proto))
	if proto == "" {
		proto = "tcp"
	}
	if proto != "tcp" && proto != "udp" && proto != "any" {
		return fmt.Errorf("unsupported protocol '%s' (must be 'tcp', 'udp', or 'any')", proto)
	}
	if (port == 22 && (proto == "tcp" || proto == "any")) && !strings.EqualFold(strings.TrimSpace(os.Getenv("PANEL_ALLOW_SSH_LOCKOUT")), "true") {
		return fmt.Errorf("refusing to deny SSH port 22 without PANEL_ALLOW_SSH_LOCKOUT=true and verified out-of-band access")
	}

	var cmd *exec.Cmd
	if fm.backend == "ufw" {
		ruleSpec := fmt.Sprintf("%d/%s", port, proto)
		if proto == "any" {
			ruleSpec = fmt.Sprintf("%d", port)
		}
		cmd = exec.CommandContext(ctx, "ufw", "deny", ruleSpec)
	} else {
		if err := fm.ensureNFTInputChain(ctx); err != nil {
			return err
		}
		if proto == "any" {
			for _, p := range []string{"tcp", "udp"} {
				if err := fm.nftRule(ctx, p, port, "drop"); err != nil {
					return err
				}
			}
			return nil
		}
		return fm.nftRule(ctx, proto, port, "drop")
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("firewall deny command failed: %s (%w)", string(out), err)
	}

	return nil
}

// parseUFWNumberedOutput parses `ufw status numbered` text.
func parseUFWNumberedOutput(output string) []FirewallRule {
	var rules []FirewallRule
	scanner := bufio.NewScanner(strings.NewReader(output))
	ruleRegex := regexp.MustCompile(`^\[\s*(\d+)\]\s+(\d+)(?:/([a-zA-Z]+))?\s+([A-Z]+)\s+IN\s+([^\s#]+)(?:\s+#\s+(.*))?$`)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		matches := ruleRegex.FindStringSubmatch(line)
		if len(matches) > 0 {
			id, _ := strconv.Atoi(matches[1])
			port, _ := strconv.Atoi(matches[2])
			proto := matches[3]
			if proto == "" {
				proto = "any"
			}
			action := FirewallAction(matches[4])
			fromIP := matches[5]
			comment := ""
			if len(matches) >= 7 {
				comment = matches[6]
			}

			rules = append(rules, FirewallRule{
				ID:       id,
				Port:     port,
				Protocol: proto,
				Action:   action,
				FromIP:   fromIP,
				Comment:  comment,
			})
		}
	}

	return rules
}

type FirewallRequest struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	Comment  string `json:"comment"`
}

func (fm *FirewallManager) Allow(req FirewallRequest) error {
	return fm.AllowPort(context.Background(), req.Port, req.Protocol, req.Comment)
}
func (fm *FirewallManager) Deny(req FirewallRequest) error {
	return fm.DenyPort(context.Background(), req.Port, req.Protocol)
}

func (fm *FirewallManager) ensureNFTInputChain(ctx context.Context) error {
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("PANEL_NFTABLES_MUTATIONS_ENABLED")), "true") {
		return fmt.Errorf("nftables mutations are disabled by default; review the host ruleset and explicitly enable PANEL_NFTABLES_MUTATIONS_ENABLED only after recovery access is verified")
	}
	if _, err := exec.CommandContext(ctx, "nft", "list", "chain", "inet", "filter", "input").CombinedOutput(); err != nil {
		return fmt.Errorf("refusing to create or change an nftables base chain automatically; expected existing inet filter input chain: %w", err)
	}
	return nil
}

func (fm *FirewallManager) nftRule(ctx context.Context, proto string, port int, action string) error {
	out, err := exec.CommandContext(ctx, "nft", "insert", "rule", "inet", "filter", "input", proto, "dport", strconv.Itoa(port), action).CombinedOutput()
	if err != nil {
		return fmt.Errorf("nft rule failed: %s (%w)", out, err)
	}
	return nil
}

func parseNFTOutput(output string) []FirewallRule {
	var rules []FirewallRule
	re := regexp.MustCompile(`(?i)(tcp|udp) dport ([0-9]+).*?(accept|drop)(?:.*?comment "([^"]*)")?`)
	scanner := bufio.NewScanner(strings.NewReader(output))
	id := 1
	for scanner.Scan() {
		m := re.FindStringSubmatch(scanner.Text())
		if len(m) == 0 {
			continue
		}
		port, _ := strconv.Atoi(m[2])
		action := ActionDeny
		if strings.EqualFold(m[3], "accept") {
			action = ActionAllow
		}
		rules = append(rules, FirewallRule{ID: id, Port: port, Protocol: strings.ToLower(m[1]), Action: action, FromIP: "Anywhere", Comment: m[4]})
		id++
	}
	return rules
}
