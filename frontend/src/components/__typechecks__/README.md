# Component Type Checks

This directory contains type-check files that verify component imports and type signatures are correct.

## Purpose

These files help ensure that:
- Components can be imported without errors
- Type signatures remain consistent
- No unused imports are accidentally added
- D3 and React types are properly used

## Usage

Type checks are automatically included in the standard build process (`npm run build`).

To run type checks explicitly:

```bash
npx tsc -b
```

## CommunityMap Type Check

The `CommunityMap.typecheck.ts` file specifically verifies:
- The component exports properly
- Props interface is correct
- No unused GraphNode or GraphLink types are imported (only GraphData is needed)
- D3 zoom/pan types follow proper patterns

This addresses the acceptance criteria from issue #24 regarding TypeScript errors and unused imports.
