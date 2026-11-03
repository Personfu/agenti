package security

import (
	"strings"
	"testing"
	"time"

	"github.com/go-viper/mapstructure/v2"
)

func TestMalformedConfigurationDoesNotEchoInput(t *testing.T) {
	const marker = "synthetic-invalid-configuration"
	var number int
	err := mapstructure.WeakDecode(marker, &number)
	if err == nil {
		t.Fatal("malformed integer configuration was accepted")
	}
	if strings.Contains(err.Error(), marker) {
		t.Fatal("malformed configuration echoed its input value")
	}
	if err := mapstructure.WeakDecode("17", &number); err != nil || number != 17 {
		t.Fatal("valid numeric configuration no longer decodes")
	}
}

func TestDurationConfigurationDoesNotEchoInput(t *testing.T) {
	const marker = "synthetic-invalid-duration"
	var duration time.Duration
	decoder, err := mapstructure.NewDecoder(&mapstructure.DecoderConfig{
		DecodeHook: mapstructure.StringToTimeDurationHookFunc(),
		Result:     &duration,
	})
	if err != nil {
		t.Fatal("could not construct duration decoder")
	}
	err = decoder.Decode(marker)
	if err == nil {
		t.Fatal("malformed duration configuration was accepted")
	}
	if strings.Contains(err.Error(), marker) {
		t.Fatal("malformed duration configuration echoed its input value")
	}
	if err := decoder.Decode("1s"); err != nil || duration != time.Second {
		t.Fatal("valid duration configuration no longer decodes")
	}
}
