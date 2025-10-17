/**
 * Type-check verification for CommunityMap component
 * This file ensures the component imports and types are correct.
 * Run: npx tsc --noEmit src/components/__typechecks__/CommunityMap.typecheck.ts
 */

import CommunityMap from '../CommunityMap';
import type { CommunityResult } from '../../utils/communityDetection';

// Verify component can be imported
const Component: typeof CommunityMap = CommunityMap;

// Verify props interface
type Props = Parameters<typeof CommunityMap>[0];

// Type assertions to ensure proper prop types
const validProps: Props = {
  communityResult: null,
  onBack: () => {},
  onFocusNode: (_id: string) => {},
};

const minimalProps: Props = {};

const withCommunityResult: Props = {
  communityResult: {
    communities: [],
    nodeCommunities: new Map(),
    modularity: 0,
  } as CommunityResult,
};

// Ensure no unused graph types are imported
// GraphNode and GraphLink should NOT be imported in CommunityMap
// as they are not used - only GraphData is needed

export { Component, validProps, minimalProps, withCommunityResult };
