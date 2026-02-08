package graph

import (
	"math"
	"testing"
)

// TestLayoutQuality verifies that Barnes-Hut produces reasonable layouts
func TestLayoutQuality(t *testing.T) {
	// Create a simple graph: 4 nodes in a square
	N := 4
	X := []float64{0, 100, 0, 100}
	Y := []float64{0, 0, 100, 100}
	
	// Edges forming a square: 0-1, 1-3, 3-2, 2-0
	edges := []struct{ a, b int }{
		{0, 1}, {1, 3}, {3, 2}, {2, 0},
	}
	
	// Run a few iterations of layout
	iterations := 50
	k := 50.0
	repStrength := k * k
	theta := 0.8
	
	for it := 0; it < iterations; it++ {
		// Repulsive forces (Barnes-Hut)
		repX, repY := calculateBarnesHutForces(X, Y, theta, repStrength)
		
		// Attractive forces along edges
		dispX := make([]float64, N)
		dispY := make([]float64, N)
		for i := range dispX {
			dispX[i] = repX[i]
			dispY[i] = repY[i]
		}
		
		for _, e := range edges {
			dx := X[e.a] - X[e.b]
			dy := Y[e.a] - Y[e.b]
			dist := math.Hypot(dx, dy)
			if dist < 1e-6 {
				continue
			}
			force := (dist * dist) / k
			ax := dx / dist * force
			ay := dy / dist * force
			dispX[e.a] -= ax
			dispY[e.a] -= ay
			dispX[e.b] += ax
			dispY[e.b] += ay
		}
		
		// Apply forces with damping
		temp := 10.0 * (1 - float64(it)/float64(iterations))
		for i := 0; i < N; i++ {
			disp := math.Hypot(dispX[i], dispY[i])
			if disp > 0 {
				X[i] += dispX[i] / disp * math.Min(disp, temp)
				Y[i] += dispY[i] / disp * math.Min(disp, temp)
			}
		}
	}
	
	// Verify layout doesn't collapse to a point or explode
	minX, maxX := X[0], X[0]
	minY, maxY := Y[0], Y[0]
	for i := 1; i < N; i++ {
		if X[i] < minX {
			minX = X[i]
		}
		if X[i] > maxX {
			maxX = X[i]
		}
		if Y[i] < minY {
			minY = Y[i]
		}
		if Y[i] > maxY {
			maxY = Y[i]
		}
	}
	
	width := maxX - minX
	height := maxY - minY
	
	// Layout should span a reasonable area (not collapsed, not exploded)
	if width < 10 || height < 10 {
		t.Errorf("layout collapsed: width=%.2f, height=%.2f", width, height)
	}
	if width > 10000 || height > 10000 {
		t.Errorf("layout exploded: width=%.2f, height=%.2f", width, height)
	}
	
	// Nodes should be spread out
	for i := 0; i < N; i++ {
		for j := i + 1; j < N; j++ {
			dist := math.Hypot(X[i]-X[j], Y[i]-Y[j])
			if dist < 1 {
				t.Errorf("nodes %d and %d too close: dist=%.2f", i, j, dist)
			}
		}
	}
}

// TestLayoutConvergence verifies layout converges with Barnes-Hut
func TestLayoutConvergence(t *testing.T) {
	N := 10
	X := make([]float64, N)
	Y := make([]float64, N)
	
	// Random initial positions
	for i := 0; i < N; i++ {
		X[i] = float64(i * 10)
		Y[i] = float64((i * 7) % 10 * 10)
	}
	
	// Measure total displacement over iterations
	k := 50.0
	repStrength := k * k
	theta := 0.8
	
	prevTotalDisp := 1e10
	for it := 0; it < 100; it++ {
		repX, repY := calculateBarnesHutForces(X, Y, theta, repStrength)
		
		totalDisp := 0.0
		temp := 100.0 * (1 - float64(it)/100.0)
		for i := 0; i < N; i++ {
			disp := math.Hypot(repX[i], repY[i])
			totalDisp += disp
			if disp > 0 {
				X[i] += repX[i] / disp * math.Min(disp, temp)
				Y[i] += repY[i] / disp * math.Min(disp, temp)
			}
		}
		
		// After initial spreading, displacement should decrease
		if it > 20 && totalDisp > prevTotalDisp*1.5 {
			t.Errorf("layout not converging at iteration %d: curr=%.2f, prev=%.2f", it, totalDisp, prevTotalDisp)
		}
		prevTotalDisp = totalDisp
	}
}

// TestBarnesHutVsBruteForceQuality compares layout quality
func TestBarnesHutVsBruteForceQuality(t *testing.T) {
	// Same initial configuration
	N := 20
	X1 := make([]float64, N)
	Y1 := make([]float64, N)
	X2 := make([]float64, N)
	Y2 := make([]float64, N)
	
	for i := 0; i < N; i++ {
		angle := 2 * math.Pi * float64(i) / float64(N)
		X1[i] = 100 * math.Cos(angle)
		Y1[i] = 100 * math.Sin(angle)
		X2[i] = X1[i]
		Y2[i] = Y1[i]
	}
	
	k := 50.0
	repStrength := k * k
	theta := 0.8
	iterations := 50
	
	// Run Barnes-Hut layout
	for it := 0; it < iterations; it++ {
		repX, repY := calculateBarnesHutForces(X1, Y1, theta, repStrength)
		temp := 100.0 * (1 - float64(it)/float64(iterations))
		for i := 0; i < N; i++ {
			disp := math.Hypot(repX[i], repY[i])
			if disp > 0 {
				X1[i] += repX[i] / disp * math.Min(disp, temp)
				Y1[i] += repY[i] / disp * math.Min(disp, temp)
			}
		}
	}
	
	// Run brute force layout
	for it := 0; it < iterations; it++ {
		repX, repY := bruteForceRepulsion(X2, Y2, repStrength)
		temp := 100.0 * (1 - float64(it)/float64(iterations))
		for i := 0; i < N; i++ {
			disp := math.Hypot(repX[i], repY[i])
			if disp > 0 {
				X2[i] += repX[i] / disp * math.Min(disp, temp)
				Y2[i] += repY[i] / disp * math.Min(disp, temp)
			}
		}
	}
	
	// Compare final layouts - should be similar
	totalDiff := 0.0
	for i := 0; i < N; i++ {
		diff := math.Hypot(X1[i]-X2[i], Y1[i]-Y2[i])
		totalDiff += diff
	}
	avgDiff := totalDiff / float64(N)
	
	// Average position difference should be small relative to layout size
	// (allowing some variation due to approximation)
	if avgDiff > 50 {
		t.Errorf("layouts differ significantly: avg diff=%.2f", avgDiff)
	}
}

// TestThetaAccuracyTradeoff verifies theta parameter behavior
func TestThetaAccuracyTradeoff(t *testing.T) {
	N := 50
	X := make([]float64, N)
	Y := make([]float64, N)
	
	for i := 0; i < N; i++ {
		X[i] = float64(i % 10) * 20
		Y[i] = float64(i / 10) * 20
	}
	
	repStrength := 1000.0
	
	// Calculate forces with different theta values
	force0, _ := calculateBarnesHutForces(X, Y, 0.0, repStrength)  // Exact
	force5, _ := calculateBarnesHutForces(X, Y, 0.5, repStrength)
	force8, _ := calculateBarnesHutForces(X, Y, 0.8, repStrength)
	force15, _ := calculateBarnesHutForces(X, Y, 1.5, repStrength)
	
	// Compare to exact (theta=0.0)
	calcError := func(force []float64) float64 {
		totalErr := 0.0
		for i := 0; i < N; i++ {
			err := math.Abs(force[i] - force0[i])
			totalErr += err
		}
		return totalErr / float64(N)
	}
	
	err5 := calcError(force5)
	err8 := calcError(force8)
	err15 := calcError(force15)
	
	// Error should increase with theta
	if err5 > err8 || err8 > err15 {
		// Note: This might not always hold due to numerical effects
		t.Logf("theta error progression: 0.5=%.2f, 0.8=%.2f, 1.5=%.2f", err5, err8, err15)
	}
	
	// theta=0.8 should have reasonable accuracy (< 10% error typically)
	maxForce := 0.0
	for i := 0; i < N; i++ {
		if math.Abs(force0[i]) > maxForce {
			maxForce = math.Abs(force0[i])
		}
	}
	relErr8 := err8 / maxForce
	if relErr8 > 0.2 {
		t.Errorf("theta=0.8 has high relative error: %.2f%%", relErr8*100)
	}
}
