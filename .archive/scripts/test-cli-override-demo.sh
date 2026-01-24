#!/bin/bash
# Demo script showing CLI override feature in action

echo "════════════════════════════════════════════════════════════"
echo "  CLI Override Feature Demonstration"
echo "════════════════════════════════════════════════════════════"
echo ""

echo "1. Type Definition"
echo "   Location: src/types/index.ts:65"
echo ""
grep -A1 "Optional CLI override" src/types/index.ts | grep "cli?:" || grep "cli?:" src/types/index.ts
echo ""

echo "2. Priority System Implementation"
echo "   Location: src/utils/ralph-service.ts:664-706"
echo ""
echo "   Priority 1: Project-specific override (prd.json)"
grep -A3 "Priority 1: Check PRD" src/utils/ralph-service.ts | head -4
echo ""
echo "   Priority 2: Global user preferences"
grep -A2 "Priority 2: Check global" src/utils/ralph-service.ts | head -3
echo ""
echo "   Priority 3: Auto-detect first available"
grep -A2 "Priority 3: Auto-detect" src/utils/ralph-service.ts | head -3
echo ""

echo "3. UI Indicators"
echo ""
echo "   StatusBar: Shows 'CLI:claude*' (asterisk = project override)"
echo "   Location: src/components/StatusBar.tsx:87"
grep "CLI:\${activeCli}\${isProjectOverride" src/components/StatusBar.tsx
echo ""
echo "   WorkPane: Shows '(project override)' label"
echo "   Location: src/components/WorkPane.tsx:841"
grep "project override" src/components/WorkPane.tsx | head -1
echo ""

echo "4. Example prd.json with CLI override"
echo ""
cat << 'JSON'
{
  "project": "My Anthropic Project",
  "description": "A project that requires Claude",
  "branchName": "feature/my-feature",
  "cli": "claude",
  "userStories": [
    {
      "id": "US-001",
      "title": "Example Story",
      "description": "Build something amazing",
      "acceptanceCriteria": ["It works"],
      "complexity": "simple",
      "priority": 1,
      "passes": false
    }
  ]
}
JSON
echo ""

echo "5. Supported CLI Values"
echo ""
grep "cliOptions = \[" src/utils/ralph-service.ts | head -1 | sed "s/.*\[/   - /" | sed "s/, /\n   - /g" | sed "s/\];.*//"
echo ""

echo "════════════════════════════════════════════════════════════"
echo "  Feature Benefits"
echo "════════════════════════════════════════════════════════════"
echo "  • Different projects can use different AI assistants"
echo "  • Teams can standardize on specific CLIs per project"
echo "  • No manual switching required between projects"
echo "  • Clear visual indicators show active CLI and source"
echo ""
