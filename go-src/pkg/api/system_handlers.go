package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/panel/panel-agent/pkg/agent"
	"github.com/panel/panel-agent/pkg/system"
)

func HandleSystemMetrics(w http.ResponseWriter,r *http.Request){
	if r.Method!=http.MethodGet{writeJSONError(w,http.StatusMethodNotAllowed,"method not allowed");return}
	if !agent.Enabled(){writeJSONError(w,http.StatusServiceUnavailable,"privileged agent is required");return}
	b,err:=agent.Call(r.Context(),"metrics","",false);if err!=nil{writeJSONError(w,http.StatusInternalServerError,err.Error());return}
	var m system.SystemMetrics;if err:=json.Unmarshal(b,&m);err!=nil{writeJSONError(w,http.StatusInternalServerError,"invalid metrics response");return};writeJSON(w,http.StatusOK,m)
}

func HandleFirewall(w http.ResponseWriter,r *http.Request){
	if !agent.Enabled(){writeJSONError(w,http.StatusServiceUnavailable,"privileged agent is required");return}
	switch r.Method{
	case http.MethodGet:
		b,err:=agent.Call(r.Context(),"firewall_list","",false);if err!=nil{writeJSONError(w,http.StatusInternalServerError,err.Error());return};var rules []system.FirewallRule;if err:=json.Unmarshal(b,&rules);err!=nil{writeJSONError(w,http.StatusInternalServerError,"invalid firewall response");return};writeJSON(w,http.StatusOK,map[string]any{"backend":strings.TrimSpace("managed"),"rules":rules})
	case http.MethodPost:
		var p system.FirewallRequest;if err:=json.NewDecoder(http.MaxBytesReader(w,r.Body,16<<10)).Decode(&p);err!=nil{writeJSONError(w,http.StatusBadRequest,"invalid firewall request");return};op:="firewall_allow";if strings.EqualFold(p.Comment,"DENY"){op="firewall_deny"};b,err:=agent.CallJSON(r.Context(),op,"",false,p);if err!=nil{writeJSONError(w,http.StatusBadRequest,err.Error());return};writeJSON(w,http.StatusOK,map[string]any{"status":"applied","details":json.RawMessage(b)})
	default:writeJSONError(w,http.StatusMethodNotAllowed,"method not allowed")
	}
}

func HandleSSLIssue(w http.ResponseWriter,r *http.Request){
	if r.Method!=http.MethodPost{writeJSONError(w,http.StatusMethodNotAllowed,"method not allowed");return}
	d:=extractDomainParam(r.URL.Path);if _,err:=sitegenerator.SanitizeDomain(d);err!=nil{writeJSONError(w,http.StatusBadRequest,err.Error());return}
	b,err:=agent.CallJSON(r.Context(),"ssl_issue",d,false,map[string]any{"domain":d});if err!=nil{writeJSONError(w,http.StatusBadRequest,err.Error());return};writeJSON(w,http.StatusOK,map[string]any{"status":"issued","details":json.RawMessage(b)})
}
