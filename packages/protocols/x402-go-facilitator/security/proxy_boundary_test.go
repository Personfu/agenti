package security

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// All traffic remains on two disposable loopback servers. No wallet, signing,
// payment, RPC client, application config or production secret is loaded.
func TestRejectedUpgradeCannotTunnelPastRouteAuthorization(t *testing.T) {
	var privateUpstreamRequests atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/private" {
			privateUpstreamRequests.Add(1)
		}
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK) // Reject the upgrade but retain HTTP keep-alive.
		_, _ = io.WriteString(w, "ok")
	}))
	defer upstream.Close()
	target, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}
	e := echo.New()
	e.Any("/public/*", func(c echo.Context) error { return c.NoContent(http.StatusNoContent) },
		middleware.Proxy(middleware.NewRoundRobinBalancer([]*middleware.ProxyTarget{{URL: target}})))
	e.GET("/private", func(c echo.Context) error { return c.NoContent(http.StatusUnauthorized) })
	front := httptest.NewServer(e)
	defer front.Close()
	connection, err := net.DialTimeout("tcp", front.Listener.Addr().String(), 3*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	if err := connection.SetDeadline(time.Now().Add(5 * time.Second)); err != nil {
		t.Fatal(err)
	}
	reader := bufio.NewReader(connection)
	if _, err := fmt.Fprintf(connection, "GET /public/upgrade HTTP/1.1\r\nHost: local-fixture\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"); err != nil {
		t.Fatal(err)
	}
	first, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatal(err)
	}
	if first.StatusCode != http.StatusOK {
		t.Fatalf("expected ordinary rejected-upgrade HTTP200, got%d", first.StatusCode)
	}
	if _, err := io.Copy(io.Discard, first.Body); err != nil {
		t.Fatal(err)
	}
	if err := first.Body.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := fmt.Fprintf(connection, "GET /private HTTP/1.1\r\nHost: local-fixture\r\nConnection: close\r\n\r\n"); err != nil {
		t.Fatal(err)
	}
	second, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Body.Close()
	if second.StatusCode != http.StatusUnauthorized {
		t.Fatalf("route authorization bypassed after rejected upgrade: got%d, want401", second.StatusCode)
	}
	if privateUpstreamRequests.Load() != 0 {
		t.Fatal("private request reached upstream without passing route authorization")
	}
}
