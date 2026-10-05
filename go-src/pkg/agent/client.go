package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/panel/panel-agent/pkg/agentproto"
)

const DefaultSocket="/run/alfa-panel/agent.sock"

type Client struct{ http *http.Client }

func New(socket string)*Client{
	if socket==""{socket=DefaultSocket}
	tr:=&http.Transport{DialContext:func(ctx context.Context, network, _ string)(net.Conn,error){var d net.Dialer;return d.DialContext(ctx,"unix",socket)},MaxIdleConns:8,MaxIdleConnsPerHost:8,IdleConnTimeout:30*time.Second}
	return &Client{http:&http.Client{Transport:tr,Timeout:5*time.Minute}}
}

func Enabled()bool{return strings.TrimSpace(os.Getenv("PANEL_AGENT_SOCKET"))!="" && os.Getenv("PANEL_AGENT_MODE")!="true"}

func call(ctx context.Context,c *Client,req agentproto.Request)(agentproto.Response,error){
	b,_:=json.Marshal(req);r,err:=http.NewRequestWithContext(ctx,http.MethodPost,"http://agent/v1/operate",bytes.NewReader(b));if err!=nil{return agentproto.Response{},err};r.Header.Set("Content-Type","application/json")
	resp,err:=c.http.Do(r);if err!=nil{return agentproto.Response{},err};defer resp.Body.Close()
	var out agentproto.Response;if err:=json.NewDecoder(io.LimitReader(resp.Body,1<<20)).Decode(&out);err!=nil{return out,err};if !out.OK{return out,errors.New(out.Error)};return out,nil
}

func Call(ctx context.Context,operation,domain string,purge bool)(json.RawMessage,error){
	out,err:=call(ctx,New(os.Getenv("PANEL_AGENT_SOCKET")),agentproto.Request{Operation:operation,Domain:domain,Purge:purge})
	if err!=nil{return nil,err}
	b,err:=json.Marshal(out.Data);if err!=nil{return nil,err};return b,nil
}

func CallJSON(ctx context.Context,operation,domain string,purge bool,payload any)(json.RawMessage,error){
	b,err:=json.Marshal(payload);if err!=nil{return nil,err}
	out,err:=call(ctx,New(os.Getenv("PANEL_AGENT_SOCKET")),agentproto.Request{Operation:operation,Domain:domain,Purge:purge,Payload:b})
	if err!=nil{return nil,err};data,err:=json.Marshal(out.Data);return data,err
}

func Logs(ctx context.Context,domain string)(io.ReadCloser,error){
	c:=New(os.Getenv("PANEL_AGENT_SOCKET"));r,err:=http.NewRequestWithContext(ctx,http.MethodGet,"http://agent/v1/logs?domain="+neturl(domain),nil);if err!=nil{return nil,err};resp,err:=c.http.Do(r);if err!=nil{return nil,err};if resp.StatusCode>=400{defer resp.Body.Close();b,_:=io.ReadAll(io.LimitReader(resp.Body,1<<16));return nil,errors.New(string(b))};return resp.Body,nil
}

func neturl(v string)string{var b bytes.Buffer;for i:=0;i<len(v);i++{ch:=v[i];if (ch>='a'&&ch<='z')||(ch>='A'&&ch<='Z')||(ch>='0'&&ch<='9')||ch=='.'||ch=='-'{b.WriteByte(ch)}else{b.WriteString("%"+hex(v[i]>>4)+hex(v[i]&15))}};return b.String()}
func hex(v byte)byte{if v<10{return '0'+v};return 'A'+v-10}
