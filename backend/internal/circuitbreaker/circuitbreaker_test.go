package circuitbreaker

import (
"errors"
"testing"
"time"
)

func TestCircuitBreakerStateClosed(t *testing.T) {
cb := New(Config{
Name:             "test",
FailureThreshold: 3,
SuccessThreshold: 2,
Timeout:          100 * time.Millisecond,
})

// Should allow calls in closed state
err := cb.Call(func() error { return nil })
if err != nil {
t.Errorf("Expected success, got error: %v", err)
}

if cb.GetState() != StateClosed {
t.Errorf("Expected state to be Closed, got %v", cb.GetState())
}
}

func TestCircuitBreakerOpensAfterFailures(t *testing.T) {
cb := New(Config{
Name:             "test",
FailureThreshold: 3,
SuccessThreshold: 2,
Timeout:          100 * time.Millisecond,
})

testErr := errors.New("test error")

// Fail 3 times to open the circuit
for i := 0; i < 3; i++ {
err := cb.Call(func() error { return testErr })
if err != testErr {
t.Errorf("Expected test error, got: %v", err)
}
}

if cb.GetState() != StateOpen {
t.Errorf("Expected state to be Open, got %v", cb.GetState())
}

// Next call should fail immediately with circuit open error
err := cb.Call(func() error { return nil })
if err != ErrCircuitOpen {
t.Errorf("Expected ErrCircuitOpen, got: %v", err)
}
}

func TestCircuitBreakerHalfOpenAfterTimeout(t *testing.T) {
cb := New(Config{
Name:             "test",
FailureThreshold: 2,
SuccessThreshold: 2,
Timeout:          50 * time.Millisecond,
})

testErr := errors.New("test error")

// Open the circuit
cb.Call(func() error { return testErr })
cb.Call(func() error { return testErr })

if cb.GetState() != StateOpen {
t.Errorf("Expected state to be Open, got %v", cb.GetState())
}

// Wait for timeout
time.Sleep(60 * time.Millisecond)

// Should transition to half-open and allow attempt
err := cb.Call(func() error { return nil })
if err != nil {
t.Errorf("Expected success in half-open state, got: %v", err)
}
}

func TestCircuitBreakerClosesAfterSuccesses(t *testing.T) {
cb := New(Config{
Name:             "test",
FailureThreshold: 2,
SuccessThreshold: 2,
Timeout:          50 * time.Millisecond,
})

testErr := errors.New("test error")

// Open the circuit
cb.Call(func() error { return testErr })
cb.Call(func() error { return testErr })

// Wait for timeout to transition to half-open
time.Sleep(60 * time.Millisecond)

// Two successes should close the circuit
cb.Call(func() error { return nil })
cb.Call(func() error { return nil })

if cb.GetState() != StateClosed {
t.Errorf("Expected state to be Closed, got %v", cb.GetState())
}
}

func TestCircuitBreakerReopensOnFailureInHalfOpen(t *testing.T) {
cb := New(Config{
Name:             "test",
FailureThreshold: 2,
SuccessThreshold: 2,
Timeout:          50 * time.Millisecond,
})

testErr := errors.New("test error")

// Open the circuit
cb.Call(func() error { return testErr })
cb.Call(func() error { return testErr })

// Wait for timeout to transition to half-open
time.Sleep(60 * time.Millisecond)

// Failure in half-open should reopen the circuit
cb.Call(func() error { return testErr })

if cb.GetState() != StateOpen {
t.Errorf("Expected state to be Open after failure in half-open, got %v", cb.GetState())
}
}
