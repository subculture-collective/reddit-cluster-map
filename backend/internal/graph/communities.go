package graph

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"sort"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// Community represents a detected community with its members
type Community struct {
	ID      int
	Members []string
	Label   string
}

// CommunityResult holds the result of community detection
type CommunityResult struct {
	Communities     []Community
	NodeToCommunity map[string]int
	Modularity      float64
}

// detectCommunities performs Louvain community detection on the graph
func (s *Service) detectCommunities(ctx context.Context, queries *db.Queries) (*CommunityResult, error) {
	log.Printf("🔍 Starting community detection (Louvain algorithm)")

	// Fetch all nodes and links
	nodes, err := queries.ListGraphNodesByWeight(ctx, 50000) // Cap at 50k nodes for performance
	if err != nil {
		return nil, fmt.Errorf("fetch nodes: %w", err)
	}
	if len(nodes) == 0 {
		log.Printf("ℹ️ No nodes found for community detection")
		return &CommunityResult{Communities: []Community{}, NodeToCommunity: map[string]int{}, Modularity: 0}, nil
	}

	nodeIDs := make([]string, len(nodes))
	for i, n := range nodes {
		nodeIDs[i] = n.ID
	}

	links, err := queries.ListGraphLinksAmong(ctx, nodeIDs)
	if err != nil {
		return nil, fmt.Errorf("fetch links: %w", err)
	}

	log.Printf("📊 Building graph structure: %d nodes, %d links", len(nodeIDs), len(links))

	// Build adjacency map and degree map
	adjacency := make(map[string]map[string]int)
	degrees := make(map[string]int)
	for _, id := range nodeIDs {
		adjacency[id] = make(map[string]int)
		degrees[id] = 0
	}

	totalWeight := 0
	for _, link := range links {
		src := link.Source
		tgt := link.Target
		if _, ok := adjacency[src]; !ok {
			continue
		}
		if _, ok := adjacency[tgt]; !ok {
			continue
		}

		weight := 1
		adjacency[src][tgt] = adjacency[src][tgt] + weight
		adjacency[tgt][src] = adjacency[tgt][src] + weight
		degrees[src] += weight
		degrees[tgt] += weight
		totalWeight += weight
	}

	// Initialize each node to its own community
	nodeToCommunity := make(map[string]int)
	for i, id := range nodeIDs {
		nodeToCommunity[id] = i
	}

	// Louvain algorithm: iteratively move nodes to neighboring communities
	improved := true
	iteration := 0
	maxIterations := 50

	for improved && iteration < maxIterations {
		improved = false
		iteration++

		// Shuffle nodes for better results
		shuffled := make([]string, len(nodeIDs))
		copy(shuffled, nodeIDs)
		rand.Shuffle(len(shuffled), func(i, j int) {
			shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
		})

		for _, nodeID := range shuffled {
			currentCommunity := nodeToCommunity[nodeID]
			neighbors := adjacency[nodeID]

			// Find neighboring communities
			neighborCommunities := make(map[int]bool)
			for neighbor := range neighbors {
				nComm := nodeToCommunity[neighbor]
				neighborCommunities[nComm] = true
			}

			bestCommunity := currentCommunity
			bestGain := 0.0

			// Try moving to each neighboring community
			for targetCommunity := range neighborCommunities {
				if targetCommunity == currentCommunity {
					continue
				}

				gain := modularityGain(nodeID, currentCommunity, targetCommunity, nodeToCommunity, adjacency, degrees, totalWeight)
				if gain > bestGain {
					bestGain = gain
					bestCommunity = targetCommunity
				}
			}

			// Move to best community if improvement found
			if bestCommunity != currentCommunity {
				nodeToCommunity[nodeID] = bestCommunity
				improved = true
			}
		}

		log.Printf("⏱ Iteration %d: improved=%v", iteration, improved)
	}

	// Renumber communities to be sequential
	uniqueCommunities := make(map[int]bool)
	for _, comm := range nodeToCommunity {
		uniqueCommunities[comm] = true
	}

	communityIDs := make([]int, 0, len(uniqueCommunities))
	for comm := range uniqueCommunities {
		communityIDs = append(communityIDs, comm)
	}
	sort.Ints(communityIDs)

	communityMap := make(map[int]int)
	for i, oldID := range communityIDs {
		communityMap[oldID] = i
	}

	finalNodeToCommunity := make(map[string]int)
	for node, comm := range nodeToCommunity {
		finalNodeToCommunity[node] = communityMap[comm]
	}

	// Build community information
	communitySizes := make(map[int][]string)
	for node, comm := range finalNodeToCommunity {
		communitySizes[comm] = append(communitySizes[comm], node)
	}

	// Calculate degree for each node
	nodeDegrees := make(map[string]int)
	for _, link := range links {
		nodeDegrees[link.Source]++
		nodeDegrees[link.Target]++
	}

	// Create communities with labels
	communities := make([]Community, 0, len(communitySizes))
	for id, members := range communitySizes {
		// Find top node to use as label
		topNode := ""
		maxDegree := -1
		for _, nodeID := range members {
			if deg := nodeDegrees[nodeID]; deg > maxDegree {
				maxDegree = deg
				topNode = nodeID
			}
		}

		label := topNode
		if label == "" {
			label = fmt.Sprintf("Community %d", id)
		} else {
			// Try to find the node name
			for _, n := range nodes {
				if n.ID == topNode {
					label = n.Name
					break
				}
			}
		}

		communities = append(communities, Community{
			ID:      id,
			Members: members,
			Label:   label,
		})
	}

	// Sort by size descending
	sort.Slice(communities, func(i, j int) bool {
		return len(communities[i].Members) > len(communities[j].Members)
	})

	// Calculate final modularity
	modularity := calculateModularity(finalNodeToCommunity, adjacency, degrees, totalWeight)

	log.Printf("✅ Community detection complete: %d communities, modularity=%.3f", len(communities), modularity)

	return &CommunityResult{
		Communities:     communities,
		NodeToCommunity: finalNodeToCommunity,
		Modularity:      modularity,
	}, nil
}

// modularityGain calculates the gain in modularity from moving a node between communities
func modularityGain(nodeID string, fromCommunity, toCommunity int, nodeToCommunity map[string]int, adjacency map[string]map[string]int, degrees map[string]int, totalWeight int) float64 {
	if totalWeight == 0 {
		return 0
	}

	neighbors := adjacency[nodeID]
	nodeDegree := degrees[nodeID]

	// Sum of weights to nodes in target community
	weightTo := 0
	// Sum of weights to nodes in current community
	weightFrom := 0

	for neighbor, weight := range neighbors {
		nComm := nodeToCommunity[neighbor]
		if nComm == toCommunity {
			weightTo += weight
		} else if nComm == fromCommunity {
			weightFrom += weight
		}
	}

	m2 := float64(2 * totalWeight)
	gain := (float64(weightTo-weightFrom) / m2) -
		(float64(nodeDegree) *
			(float64(sumDegrees(toCommunity, nodeToCommunity, degrees)) -
				float64(sumDegrees(fromCommunity, nodeToCommunity, degrees))) /
			(m2 * m2))

	return gain
}

// sumDegrees sums the degrees of all nodes in a community
func sumDegrees(community int, nodeToCommunity map[string]int, degrees map[string]int) int {
	sum := 0
	for node, comm := range nodeToCommunity {
		if comm == community {
			sum += degrees[node]
		}
	}
	return sum
}

// calculateModularity calculates the modularity of the current community structure
func calculateModularity(nodeToCommunity map[string]int, adjacency map[string]map[string]int, degrees map[string]int, totalWeight int) float64 {
	if totalWeight == 0 {
		return 0
	}

	modularity := 0.0
	m2 := float64(2 * totalWeight)

	for node1, neighbors := range adjacency {
		comm1 := nodeToCommunity[node1]
		deg1 := degrees[node1]

		for node2, weight := range neighbors {
			comm2 := nodeToCommunity[node2]
			if comm1 == comm2 {
				deg2 := degrees[node2]
				modularity += float64(weight) - (float64(deg1)*float64(deg2))/m2
			}
		}
	}

	return modularity / m2
}

// storeCommunities stores the detected communities in the database
func (s *Service) storeCommunities(ctx context.Context, queries *db.Queries, result *CommunityResult) error {
	log.Printf("💾 Storing community detection results")

	// Clear existing communities
	if err := queries.ClearCommunityTables(ctx); err != nil {
		return fmt.Errorf("clear community tables: %w", err)
	}

	// Insert communities
	for _, comm := range result.Communities {
		dbComm, err := queries.CreateCommunity(ctx, db.CreateCommunityParams{
			Label:      comm.Label,
			Size:       int32(len(comm.Members)),
			Modularity: sql.NullFloat64{Float64: result.Modularity, Valid: true},
		})
		if err != nil {
			log.Printf("⚠️ failed to create community %d: %v", comm.ID, err)
			continue
		}

		// Insert members
		for _, memberID := range comm.Members {
			if err := queries.CreateCommunityMember(ctx, db.CreateCommunityMemberParams{
				CommunityID: dbComm.ID,
				NodeID:      memberID,
			}); err != nil {
				log.Printf("⚠️ failed to add member %s to community %d: %v", memberID, dbComm.ID, err)
			}
		}
	}

	// Calculate and store inter-community links
	linkWeights := make(map[[2]int32]int)
	
	// We need to fetch links again to calculate inter-community weights
	nodes, err := queries.ListGraphNodesByWeight(ctx, 50000)
	if err != nil {
		return fmt.Errorf("fetch nodes for links: %w", err)
	}
	
	nodeIDs := make([]string, len(nodes))
	for i, n := range nodes {
		nodeIDs[i] = n.ID
	}
	
	links, err := queries.ListGraphLinksAmong(ctx, nodeIDs)
	if err != nil {
		return fmt.Errorf("fetch links: %w", err)
	}

	// Map node IDs to their database community IDs
	nodeToDB := make(map[string]int32)
	for _, comm := range result.Communities {
		dbComms, err := queries.GetAllCommunities(ctx)
		if err != nil {
			return fmt.Errorf("fetch communities: %w", err)
		}
		// Match by label and size
		for _, dbComm := range dbComms {
			if dbComm.Label == comm.Label && dbComm.Size == int32(len(comm.Members)) {
				for _, memberID := range comm.Members {
					nodeToDB[memberID] = dbComm.ID
				}
				break
			}
		}
	}

	// Count inter-community links
	for _, link := range links {
		commA, okA := nodeToDB[link.Source]
		commB, okB := nodeToDB[link.Target]
		if !okA || !okB || commA == commB {
			continue
		}

		// Create ordered pair
		var key [2]int32
		if commA < commB {
			key = [2]int32{commA, commB}
		} else {
			key = [2]int32{commB, commA}
		}
		linkWeights[key]++
	}

	// Store inter-community links
	for key, weight := range linkWeights {
		if err := queries.CreateCommunityLink(ctx, db.CreateCommunityLinkParams{
			SourceCommunityID: key[0],
			TargetCommunityID: key[1],
			Weight:            int32(weight),
		}); err != nil {
			log.Printf("⚠️ failed to create community link %d->%d: %v", key[0], key[1], err)
		}
	}

	log.Printf("✅ Stored %d communities with inter-community links", len(result.Communities))
	return nil
}
