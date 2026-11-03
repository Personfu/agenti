package sdk_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/gosuda/x402-facilitator/internal/sdk"
	x402 "github.com/x402-foundation/x402/go/v2"
)

// This mechanism has no signer, wallet, RPC client or network operation. Its
// canned responses exercise only SDK registration and protocol dispatch.
type offlineMechanism struct {
	verified int
	settled  int
}

func (*offlineMechanism) Scheme() string                              { return "exact" }
func (*offlineMechanism) CaipFamily() string                          { return "eip155:*" }
func (*offlineMechanism) GetExtra(sdk.Network) map[string]interface{} { return nil }
func (*offlineMechanism) GetSigners(sdk.Network) []string             { return nil }
func (m *offlineMechanism) Verify(context.Context, sdk.PaymentPayload, sdk.PaymentRequirements, *x402.FacilitatorContext) (*sdk.VerifyResponse, error) {
	m.verified++
	return &sdk.VerifyResponse{IsValid: true}, nil
}
func (m *offlineMechanism) Settle(_ context.Context, _ sdk.PaymentPayload, requirements sdk.PaymentRequirements, _ *x402.FacilitatorContext) (*sdk.SettleResponse, error) {
	m.settled++
	return &sdk.SettleResponse{Success: true, Transaction: "offline-fixture-no-transaction", Network: sdk.Network(requirements.Network)}, nil
}

func fixturePayload(t *testing.T, network string) ([]byte, []byte) {
	t.Helper()
	requirements := sdk.PaymentRequirements{
		Scheme: "exact", Network: network, Asset: "0x1111111111111111111111111111111111111111",
		PayTo: "0x2222222222222222222222222222222222222222", Amount: "1", MaxTimeoutSeconds: 60,
	}
	payload, err := json.Marshal(sdk.PaymentPayload{X402Version: 2, Accepted: requirements, Payload: map[string]interface{}{"offlineFixture": true}})
	if err != nil {
		t.Fatal("could not serialize inert protocol payload")
	}
	encoded, err := json.Marshal(requirements)
	if err != nil {
		t.Fatal("could not serialize inert protocol requirements")
	}
	return payload, encoded
}

func TestSDKOfflineProtocolDispatch(t *testing.T) {
	mechanism := &offlineMechanism{}
	facilitator := sdk.NewFacilitator().Register([]sdk.Network{"eip155:84532"}, mechanism)
	payload, requirements := fixturePayload(t, "eip155:84532")
	verified, err := facilitator.Verify(context.Background(), payload, requirements)
	if err != nil || verified == nil || !verified.IsValid || mechanism.verified != 1 {
		t.Fatal("registered V2 mechanism did not receive the inert verify dispatch")
	}
	settled, err := facilitator.Settle(context.Background(), payload, requirements)
	if err != nil || settled == nil || !settled.Success || settled.Transaction != "offline-fixture-no-transaction" || mechanism.settled != 1 {
		t.Fatal("registered V2 mechanism did not receive the inert settle dispatch")
	}
	unknownPayload, unknownRequirements := fixturePayload(t, "eip155:99999")
	if _, err := facilitator.Verify(context.Background(), unknownPayload, unknownRequirements); err == nil || mechanism.verified != 1 {
		t.Fatal("unregistered network reached a mechanism")
	}
}
