package graph

import (
	"fmt"
	"math"
	"testing"
)

// BenchmarkBarnesHutVsBruteForce compares Barnes-Hut against brute force
func BenchmarkBarnesHutVsBruteForce(b *testing.B) {
	sizes := []int{100, 500, 1000, 2000, 5000}
	
	for _, N := range sizes {
		// Setup test data
		X := make([]float64, N)
		Y := make([]float64, N)
		for i := 0; i < N; i++ {
			angle := 2 * math.Pi * float64(i) / float64(N)
			radius := 100.0 * math.Sqrt(float64(N)/1000.0+1)
			X[i] = radius * math.Cos(angle)
			Y[i] = radius * math.Sin(angle)
		}
		
		repStrength := 10000.0
		
		b.Run(fmt.Sprintf("BarnesHut_N=%d", N), func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				calculateBarnesHutForces(X, Y, 0.8, repStrength)
			}
		})
		
		b.Run(fmt.Sprintf("BruteForce_N=%d", N), func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				bruteForceRepulsion(X, Y, repStrength)
			}
		})
	}
}

// bruteForceRepulsion implements O(n²) brute-force repulsion calculation for comparison
func bruteForceRepulsion(X, Y []float64, repStrength float64) ([]float64, []float64) {
	N := len(X)
	dispX := make([]float64, N)
	dispY := make([]float64, N)
	
	for v := 0; v < N; v++ {
		for u := v + 1; u < N; u++ {
			dx := X[v] - X[u]
			dy := Y[v] - Y[u]
			dist := math.Sqrt(dx*dx + dy*dy)
			if dist < 1e-6 {
				continue
			}
			force := repStrength / (dist * dist)
			fx := dx / dist * force
			fy := dy / dist * force
			dispX[v] += fx
			dispY[v] += fy
			dispX[u] -= fx
			dispY[u] -= fy
		}
	}
	
	return dispX, dispY
}

// BenchmarkLayoutScalability tests how layout scales with different node counts
func BenchmarkLayoutScalability(b *testing.B) {
	testCases := []struct {
		nodes      int
		iterations int
	}{
		{100, 100},
		{500, 100},
		{1000, 100},
		{2000, 50},
		{5000, 50},
		{10000, 25},
		{20000, 25},
	}
	
	for _, tc := range testCases {
		b.Run(fmt.Sprintf("N=%d_Iter=%d", tc.nodes, tc.iterations), func(b *testing.B) {
			// Setup positions
			X := make([]float64, tc.nodes)
			Y := make([]float64, tc.nodes)
			for i := 0; i < tc.nodes; i++ {
				angle := 2 * math.Pi * float64(i) / float64(tc.nodes)
				radius := 200.0
				X[i] = radius * math.Cos(angle)
				Y[i] = radius * math.Sin(angle)
			}
			
			dispX := make([]float64, tc.nodes)
			dispY := make([]float64, tc.nodes)
			repStrength := 10000.0
			theta := 0.8
			
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				// Simulate one iteration of layout
				for j := 0; j < tc.iterations; j++ {
					repX, repY := calculateBarnesHutForces(X, Y, theta, repStrength)
					for k := 0; k < tc.nodes; k++ {
						dispX[k] = repX[k]
						dispY[k] = repY[k]
					}
				}
			}
		})
	}
}

// BenchmarkThetaParameter benchmarks different theta values
func BenchmarkThetaParameter(b *testing.B) {
	N := 1000
	X := make([]float64, N)
	Y := make([]float64, N)
	for i := 0; i < N; i++ {
		angle := 2 * math.Pi * float64(i) / float64(N)
		X[i] = 100 * math.Cos(angle)
		Y[i] = 100 * math.Sin(angle)
	}
	
	thetaValues := []float64{0.0, 0.5, 0.8, 1.0, 1.5}
	repStrength := 10000.0
	
	for _, theta := range thetaValues {
		b.Run(fmt.Sprintf("Theta=%.1f", theta), func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				calculateBarnesHutForces(X, Y, theta, repStrength)
			}
		})
	}
}

// BenchmarkQuadtreeConstruction benchmarks just the tree building
func BenchmarkQuadtreeConstruction(b *testing.B) {
	sizes := []int{100, 500, 1000, 5000, 10000}
	
	for _, N := range sizes {
		X := make([]float64, N)
		Y := make([]float64, N)
		for i := 0; i < N; i++ {
			X[i] = float64(i % 100)
			Y[i] = float64(i / 100)
		}
		
		b.Run(fmt.Sprintf("N=%d", N), func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				buildBarnesHutTree(X, Y)
			}
		})
	}
}
