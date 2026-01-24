# Ralph Ultra Settings & Execution Mode Exploration - Documentation Index

**Exploration Completed**: 2026-01-24  
**Focus**: Settings management, execution modes, and configuration architecture  
**Scope**: READ-ONLY code analysis of existing implementation

---

## Generated Documentation Files

### 1. EXPLORATION_SUMMARY.txt (START HERE)
**Purpose**: Executive summary with key findings  
**Length**: 2-3 min read  
**Contains**:
- Quick overview of all findings
- Architecture patterns
- Current limitations
- Recommendations
- Next steps
- Conclusion

**Best for**: Getting a comprehensive but brief overview

---

### 2. SETTINGS_QUICK_REFERENCE.md (LOOKUP GUIDE)
**Purpose**: Quick lookup tables and reference information  
**Length**: 5-10 min to review  
**Contains**:
- File locations table
- Settings.json schema
- API functions summary
- Keyboard shortcuts
- Task types list
- CLI options
- Pricing information
- Common operations examples
- Troubleshooting guide

**Best for**: Quick lookups, copy-paste examples, troubleshooting

---

### 3. SETTINGS_EXPLORATION_REPORT.md (COMPREHENSIVE)
**Purpose**: Detailed analysis of all systems  
**Length**: 30-45 min to read thoroughly  
**Contains** (15 sections):
1. Executive summary
2. Settings storage & management
3. Settings interface & persistence
4. Settings API functions
5. Recent projects storage
6. Execution mode definitions
7. Current execution mode handling
8. Model selection by execution mode
9. Execution plan integration
10. Story allocation with modes
11. Settings usage in components
12. Current data flow architecture
13. Model learning & performance data
14. Cost tracking system
15. Project-level configuration
16. Storage patterns & persistence
17. Key patterns & best practices observed
18. Recommendations for enhancement
19. Summary table
20. Conclusion

**Best for**: Understanding the complete system, deep technical analysis

---

### 4. SETTINGS_ARCHITECTURE.md (VISUAL DIAGRAMS)
**Purpose**: ASCII diagrams and visual flows  
**Length**: 20-30 min to review  
**Contains**:
- System architecture overview
- Settings data structure
- Execution mode system
- Model selection flow
- Task types to model mapping
- Execution plan generation flow
- Component integration
- Settings panel layout
- CLI detection priority
- Data persistence & lifecycle
- Quota & learning system integration
- Cost tracking architecture
- Hook state management
- Key flows (theme, mode, execution, story)

**Best for**: Visual learners, understanding data flows, implementation patterns

---

### 5. EXPLORATION_INDEX.md (THIS FILE)
**Purpose**: Navigation guide to all documentation  
**Length**: 5 min  
**Contains**:
- Overview of all documents
- Reading paths for different goals
- Key concepts overview
- Source file references

---

## Source Files Referenced

### Configuration & Settings
- `/src/utils/config.ts` - Settings API (loadSettings, saveSettings, etc.)
- `/src/components/SettingsPanel.tsx` - Settings UI component

### Execution Mode System
- `/src/core/types.ts` - Type definitions (ExecutionMode, etc.)
- `/src/core/execution-planner.ts` - Plan generation with mode
- `/src/core/capability-matrix.ts` - Model selection by mode (3 mappings)
- `/src/hooks/useExecutionPlan.tsx` - Mode state management
- `/src/components/ExecutionPlanView.tsx` - Mode display & cycling

### Execution & Service
- `/src/utils/ralph-service.ts` - CLI detection and execution

### Learning & Tracking
- `/src/core/learning-recorder.ts` - Performance recording
- `/src/core/cost-tracker.ts` - Cost calculation and tracking
- `/src/core/quota-manager.ts` - Quota handling

---

## Reading Paths

### Path 1: Quick Overview (15 minutes)
For someone who needs to understand the system quickly:
1. **Start**: EXPLORATION_SUMMARY.txt (executive summary)
2. **Skim**: SETTINGS_QUICK_REFERENCE.md (key tables)
3. **Done**: You understand the architecture

---

### Path 2: Technical Deep Dive (60 minutes)
For developers who need to work with the system:
1. **Start**: EXPLORATION_SUMMARY.txt
2. **Read**: SETTINGS_EXPLORATION_REPORT.md (sections 1-6)
3. **Study**: SETTINGS_ARCHITECTURE.md (diagrams)
4. **Reference**: SETTINGS_QUICK_REFERENCE.md (API, functions)
5. **Review**: Source files for specific components
6. **Done**: Full understanding of implementation

---

### Path 3: Implementation Research (90 minutes)
For someone planning enhancements:
1. **Read**: EXPLORATION_SUMMARY.txt (full)
2. **Study**: SETTINGS_EXPLORATION_REPORT.md (sections 12-14)
3. **Review**: SETTINGS_ARCHITECTURE.md (data flows)
4. **Deep dive**: SETTINGS_QUICK_REFERENCE.md (API section)
5. **Check**: Source files in /src/core/ and /src/utils/
6. **Reference**: Recommendation section in EXPLORATION_REPORT.md
7. **Done**: Ready to plan enhancements

---

### Path 4: Debugging & Troubleshooting (30 minutes)
For someone troubleshooting an issue:
1. **Go to**: SETTINGS_QUICK_REFERENCE.md
2. **Find**: Troubleshooting section
3. **Check**: File locations section
4. **Review**: Your specific issue
5. **Reference**: Source files as needed

---

### Path 5: Architecture Understanding (45 minutes)
For visual/conceptual learners:
1. **Study**: SETTINGS_ARCHITECTURE.md (all diagrams)
2. **Reference**: SETTINGS_EXPLORATION_REPORT.md (sections 2-9)
3. **Check**: Component flow diagrams
4. **Done**: Understand how systems interact

---

## Key Concepts Overview

### Settings System
- **Storage**: ~/.config/ralph-ultra/settings.json
- **Type**: Extensible JSON interface
- **Persistence**: Automatic file I/O
- **Scope**: Global application-level
- **Properties**: theme, CLI preference, recent projects, debug mode, etc.

### Execution Mode System
- **Modes**: 'balanced' (default) | 'super-saver' | 'fast-delivery'
- **Storage**: React component state (NOT persisted to disk)
- **Scope**: Session-level, affects entire plan
- **Keyboard**: Press 'M' to cycle modes
- **Reset**: Defaults to 'balanced' on app restart

### Model Selection
- **By Mode**: Three separate model mappings (one per mode)
- **By Task Type**: 13 different task categories
- **By Availability**: Quota-aware fallback chains
- **By History**: Learning system influences recommendations

### Data Persistence
- **Persisted**: Theme, CLI, recent projects, principles, debug mode
- **Not Persisted**: Execution mode (main gap), active project, session state

### Priority Chains
- **CLI Detection**: PRD override → Global preference → Fallback chains → Auto-detect
- **Model Selection**: Primary → Fallback → Any available with capabilities

---

## Project Structure

```
ralph-ultra/
├── src/
│   ├── components/
│   │   ├── ExecutionPlanView.tsx      [Mode display & cycling]
│   │   ├── SettingsPanel.tsx          [Settings UI]
│   │   └── ...
│   ├── core/
│   │   ├── types.ts                   [Type definitions]
│   │   ├── execution-planner.ts       [Plan generation]
│   │   ├── capability-matrix.ts       [Model mappings]
│   │   ├── learning-recorder.ts       [Performance tracking]
│   │   ├── cost-tracker.ts            [Cost calculations]
│   │   └── ...
│   ├── hooks/
│   │   ├── useExecutionPlan.tsx       [Mode state]
│   │   └── ...
│   └── utils/
│       ├── config.ts                  [Settings API]
│       ├── ralph-service.ts           [CLI detection]
│       └── ...
│
└── [DOCUMENTATION FILES]
    ├── EXPLORATION_INDEX.md           [This file]
    ├── EXPLORATION_SUMMARY.txt        [Executive summary]
    ├── SETTINGS_QUICK_REFERENCE.md    [Quick lookups]
    ├── SETTINGS_EXPLORATION_REPORT.md [Comprehensive analysis]
    └── SETTINGS_ARCHITECTURE.md       [Visual diagrams]
```

---

## Key Findings Summary

### What's Implemented
- ✅ Persistent global settings system
- ✅ Three execution modes with separate model mappings
- ✅ Quota-aware model selection
- ✅ Learning system with performance recording
- ✅ Cost tracking and estimation
- ✅ CLI detection with fallback chains
- ✅ Theme support (12 themes)
- ✅ Recent projects tracking

### What's Missing
- ❌ Execution mode persistence (resets on restart)
- ❌ Unused: activeProjectPath setting
- ❌ Cost history persistence
- ❌ Mode indicator in status bar

### Architectural Patterns
- Settings API with safe I/O
- Mode-based decision making
- Quota-aware fallback chains
- Task-type to model mapping
- Learning system for optimization
- Health checking before use

---

## Quick Reference

### File Locations
| Item | Path |
|------|------|
| Global Settings | ~/.config/ralph-ultra/settings.json |
| Principles | ~/.config/ralph-ultra/principles.md |
| First Launch Flag | ~/.config/ralph-ultra/.first-launch |
| PRD File | <project>/prd.json |
| Progress | <project>/progress.txt |
| Backups | <project>/.ralph-backups/ |

### Important Functions
| Function | Location | Purpose |
|----------|----------|---------|
| loadSettings() | config.ts | Load from disk |
| saveSettings() | config.ts | Persist to disk |
| useExecutionPlan() | hooks | Mode state management |
| generateExecutionPlan() | execution-planner | Plan with mode |
| getRecommendedModel() | capability-matrix | Select model by mode |
| detectAICLI() | ralph-service | CLI detection |

### Execution Modes
| Mode | Cost | Speed | Primary Model | Use Case |
|------|------|-------|---------------|----------|
| balanced | $$ | Medium | Sonnet | General |
| super-saver | $ | Slow | Haiku | Budget |
| fast-delivery | $$$ | Fast | Opus/GPT-4o | Time-critical |

---

## Common Questions

**Q: Where are settings stored?**
A: `~/.config/ralph-ultra/settings.json` - See File Locations in QUICK_REFERENCE

**Q: Is execution mode saved?**
A: No, it's in-memory only. See Limitations in EXPLORATION_SUMMARY.txt

**Q: How does model selection work?**
A: Task type → Mode-specific mapping → Quota-aware → Fallback. See SETTINGS_ARCHITECTURE.md

**Q: What task types are supported?**
A: 13 types. See Quick Reference for complete list.

**Q: How are costs calculated?**
A: Provider pricing × Token estimates by complexity. See Pricing in QUICK_REFERENCE.

**Q: How is CLI selected?**
A: Priority-based: PRD → Preference → Fallback → Auto-detect. See CLI Detection in ARCHITECTURE.md

**Q: How does learning work?**
A: Records all executions, aggregates by model+taskType, influences future recommendations. See Learning in ARCHITECTURE.md

---

## Next Actions

### For Understanding:
1. Read EXPLORATION_SUMMARY.txt (15 min)
2. Review relevant documentation based on your goal
3. Consult source files for implementation details

### For Implementation:
1. Review section 14 of SETTINGS_EXPLORATION_REPORT.md
2. Check recommendations for enhancement
3. Reference SETTINGS_ARCHITECTURE.md for integration points
4. Study related source files

### For Troubleshooting:
1. Check SETTINGS_QUICK_REFERENCE.md troubleshooting section
2. Verify file locations
3. Review source files for your specific component

---

## Document Statistics

| Document | Pages | Lines | Read Time |
|----------|-------|-------|-----------|
| EXPLORATION_SUMMARY.txt | 5-6 | ~400 | 5-10 min |
| SETTINGS_QUICK_REFERENCE.md | 8-10 | ~600 | 10-15 min |
| SETTINGS_EXPLORATION_REPORT.md | 20-25 | ~1600 | 30-45 min |
| SETTINGS_ARCHITECTURE.md | 15-18 | ~1200 | 20-30 min |
| EXPLORATION_INDEX.md | 3-4 | ~300 | 5 min |
| **Total** | **~50-60** | **~4100** | **~70-100 min** |

---

## Last Updated

- **Exploration Date**: 2026-01-24
- **Source Branch**: ralph/phase4-execution-modes
- **Scope**: Complete codebase analysis (READ-ONLY)
- **Status**: Documentation Complete

---

## Questions or Issues?

Refer to the comprehensive documentation above or the source files directly:
- Settings: `/src/utils/config.ts`
- Modes: `/src/core/types.ts`, `/src/hooks/useExecutionPlan.tsx`
- Models: `/src/core/capability-matrix.ts`
- Plans: `/src/core/execution-planner.ts`

---

**Start Reading**: Begin with EXPLORATION_SUMMARY.txt for a quick overview, then choose your reading path above.
