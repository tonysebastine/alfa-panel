package agentproto

type Request struct {
	Operation string `json:"operation"`
	Domain string `json:"domain,omitempty"`
	Purge bool `json:"purge,omitempty"`
}

type Response struct {
	OK bool `json:"ok"`
	Error string `json:"error,omitempty"`
	Data any `json:"data,omitempty"`
}
