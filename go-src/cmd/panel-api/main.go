package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/panel/panel-agent/pkg/api"
)

func main() {
	if strings.TrimSpace(os.Getenv("PANEL_JWT_SECRET")) == "" || len(os.Getenv("PANEL_JWT_SECRET")) < 32 {
		log.Fatal("PANEL_JWT_SECRET must be configured with at least 32 bytes")
	}
	if strings.TrimSpace(os.Getenv("PANEL_STORE_PATH")) == "" {
		log.Fatal("PANEL_STORE_PATH must be configured")
	}
	if len(strings.TrimSpace(os.Getenv("PANEL_MASTER_KEY"))) < 32 {
		log.Fatal("PANEL_MASTER_KEY must be configured with at least 32 bytes")
	}
	if strings.TrimSpace(os.Getenv("PANEL_AGENT_SOCKET")) == "" {
		log.Fatal("PANEL_AGENT_SOCKET must be configured")
	}

	addr := os.Getenv("PANEL_API_LISTEN")
	if addr == "" { addr = "127.0.0.1:8088" }
	handler := api.NewRouter()
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type","application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("/", handler)

	srv := &http.Server{
		Addr: addr, Handler: mux,
		ReadHeaderTimeout: 5*time.Second, ReadTimeout: 30*time.Second,
		WriteTimeout: 15*time.Minute, IdleTimeout: 120*time.Second,
		MaxHeaderBytes: 1<<20,
		BaseContext: func(net.Listener) context.Context { return context.Background() },
	}

	errCh:=make(chan error,1)
	go func(){ log.Printf("ALFA-PANEL API listening on %s",addr); if err:=srv.ListenAndServe(); err!=nil && !errors.Is(err,http.ErrServerClosed){errCh<-err} }()
	sig:=make(chan os.Signal,1);signal.Notify(sig,syscall.SIGINT,syscall.SIGTERM)
	select{case sig:=<-sig:log.Printf("shutdown signal: %s",sig);case err:=<-errCh:log.Fatal(err)}
	ctx,cancel:=context.WithTimeout(context.Background(),15*time.Second);defer cancel()
	if err:=srv.Shutdown(ctx);err!=nil{log.Printf("graceful shutdown failed: %v",err)}
}
