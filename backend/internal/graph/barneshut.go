package graph

import "math"

// barnesHutNode represents a quadtree node for Barnes-Hut simulation.
// This implements spatial decomposition for O(n log n) force calculation.
type barnesHutNode struct {
	// Spatial bounds
	x, y, width, height float64

	// Center of mass
	centerX, centerY float64
	mass             float64

	// Quadtree structure
	body      int  // Index of particle (if leaf)
	isLeaf    bool // True if this node contains at most one particle
	nw, ne, sw, se *barnesHutNode // Quadrants
}

// newBarnesHutNode creates a new quadtree node with the given bounds.
func newBarnesHutNode(x, y, width, height float64) *barnesHutNode {
	return &barnesHutNode{
		x:      x,
		y:      y,
		width:  width,
		height: height,
		isLeaf: true,
		body:   -1, // -1 indicates no particle
	}
}

// insert adds a particle at index i with position (px, py) and mass m to the tree.
func (node *barnesHutNode) insert(i int, px, py, m float64) {
	// If node is empty, place particle here
	if node.body == -1 && node.isLeaf {
		node.body = i
		node.centerX = px
		node.centerY = py
		node.mass = m
		return
	}

	// If node is a leaf with a particle, convert to internal node
	if node.isLeaf {
		node.isLeaf = false
		oldBody := node.body
		oldX := node.centerX
		oldY := node.centerY
		oldMass := node.mass
		node.body = -1 // No longer stores a single particle

		// Create quadrants
		halfW := node.width / 2
		halfH := node.height / 2
		node.nw = newBarnesHutNode(node.x, node.y, halfW, halfH)
		node.ne = newBarnesHutNode(node.x+halfW, node.y, halfW, halfH)
		node.sw = newBarnesHutNode(node.x, node.y+halfH, halfW, halfH)
		node.se = newBarnesHutNode(node.x+halfW, node.y+halfH, halfW, halfH)

		// Re-insert old particle into appropriate quadrant
		node.insertIntoQuadrant(oldBody, oldX, oldY, oldMass)
	}

	// Update center of mass for this node
	totalMass := node.mass + m
	node.centerX = (node.centerX*node.mass + px*m) / totalMass
	node.centerY = (node.centerY*node.mass + py*m) / totalMass
	node.mass = totalMass

	// Insert new particle into appropriate quadrant
	node.insertIntoQuadrant(i, px, py, m)
}

// insertIntoQuadrant inserts a particle into the appropriate child quadrant.
func (node *barnesHutNode) insertIntoQuadrant(i int, px, py, m float64) {
	halfW := node.width / 2
	halfH := node.height / 2
	midX := node.x + halfW
	midY := node.y + halfH

	if px < midX {
		if py < midY {
			node.nw.insert(i, px, py, m)
		} else {
			node.sw.insert(i, px, py, m)
		}
	} else {
		if py < midY {
			node.ne.insert(i, px, py, m)
		} else {
			node.se.insert(i, px, py, m)
		}
	}
}

// calculateForce computes the repulsive force on particle i at (px, py)
// using Barnes-Hut approximation with the given theta parameter.
// Returns force components (fx, fy).
func (node *barnesHutNode) calculateForce(i int, px, py, theta, repStrength float64) (float64, float64) {
	// Empty node contributes no force
	if node.mass == 0 {
		return 0, 0
	}

	dx := node.centerX - px
	dy := node.centerY - py
	dist := math.Sqrt(dx*dx + dy*dy)

	// If this is a leaf with the particle itself, skip
	if node.isLeaf && node.body == i {
		return 0, 0
	}

	// Check if we can use center-of-mass approximation
	// If node is far enough (s/d < theta), treat as single body
	if node.isLeaf || node.width/dist < theta {
		if dist < 1e-6 {
			// Particles too close, use small repulsive force
			return 0, 0
		}
		force := repStrength * node.mass / (dist * dist)
		fx := -dx / dist * force // Repulsive force pushes away
		fy := -dy / dist * force
		return fx, fy
	}

	// Node is too close, recurse into quadrants
	fx, fy := 0.0, 0.0
	if node.nw != nil {
		fxNW, fyNW := node.nw.calculateForce(i, px, py, theta, repStrength)
		fx += fxNW
		fy += fyNW
	}
	if node.ne != nil {
		fxNE, fyNE := node.ne.calculateForce(i, px, py, theta, repStrength)
		fx += fxNE
		fy += fyNE
	}
	if node.sw != nil {
		fxSW, fySW := node.sw.calculateForce(i, px, py, theta, repStrength)
		fx += fxSW
		fy += fySW
	}
	if node.se != nil {
		fxSE, fySE := node.se.calculateForce(i, px, py, theta, repStrength)
		fx += fxSE
		fy += fySE
	}

	return fx, fy
}

// buildBarnesHutTree constructs a quadtree from particle positions and masses.
func buildBarnesHutTree(X, Y []float64) *barnesHutNode {
	if len(X) == 0 {
		return nil
	}

	// Find bounding box with some padding
	minX, maxX := X[0], X[0]
	minY, maxY := Y[0], Y[0]
	for i := 1; i < len(X); i++ {
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

	// Add 10% padding to avoid edge cases
	padding := math.Max(maxX-minX, maxY-minY) * 0.1
	minX -= padding
	maxX += padding
	minY -= padding
	maxY += padding

	width := maxX - minX
	height := maxY - minY

	// Make it square to simplify quadrant logic
	if width > height {
		diff := (width - height) / 2
		minY -= diff
		height = width
	} else if height > width {
		diff := (height - width) / 2
		minX -= diff
		width = height
	}

	root := newBarnesHutNode(minX, minY, width, height)

	// Insert all particles (uniform mass for simplicity)
	for i := 0; i < len(X); i++ {
		root.insert(i, X[i], Y[i], 1.0)
	}

	return root
}

// calculateBarnesHutForces computes repulsive forces using Barnes-Hut algorithm.
// Returns force arrays dispX and dispY.
func calculateBarnesHutForces(X, Y []float64, theta, repStrength float64) ([]float64, []float64) {
	N := len(X)
	dispX := make([]float64, N)
	dispY := make([]float64, N)

	// Build the quadtree
	tree := buildBarnesHutTree(X, Y)
	if tree == nil {
		return dispX, dispY
	}

	// Calculate force on each particle
	for i := 0; i < N; i++ {
		fx, fy := tree.calculateForce(i, X[i], Y[i], theta, repStrength)
		dispX[i] = fx
		dispY[i] = fy
	}

	return dispX, dispY
}
