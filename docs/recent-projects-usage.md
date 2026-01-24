# Recent Projects Feature Usage Guide

## Overview
The Recent Projects feature tracks the last 10 projects you've accessed, providing quick navigation to frequently used projects.

## Key Features
- **Automatic Tracking**: Projects are automatically added to history when opened
- **Persistent Storage**: History survives app restarts (stored in `~/.config/ralph-ultra/settings.json`)
- **Smart Filtering**: Currently open projects are hidden from the recent list
- **Clear History**: Option to clear all recent projects
- **Keyboard Navigation**: Quick shortcuts for efficient workflow

## How to Use

### Viewing Recent Projects
1. In the Projects Rail (left panel), look for the "Recent" section
2. Press `r` to toggle the recent projects list open/closed
3. The list shows up to 5 most recent projects (excluding currently open ones)

### Selecting a Recent Project
1. Use arrow keys to navigate to a recent project
2. Press `Enter` to open it in a new tab
3. The project will open with its last known configuration

### Keyboard Shortcuts
- `r` - Toggle recent projects view (when Projects Rail is focused)
- `c` - Clear recent history (when recent section is visible)
- `Arrow keys` - Navigate through projects
- `Enter` - Select and open project

## Storage Details
- **Location**: `~/.config/ralph-ultra/settings.json`
- **Max Items**: 10 projects
- **Data Stored**:
  - Project path
  - Project name
  - Optional color and icon
  - Last accessed timestamp (ISO format)

## Example Entry
```json
{
  "recentProjects": [
    {
      "path": "/home/user/project1",
      "name": "MyApp",
      "color": "#7FFFD4",
      "lastAccessed": "2024-01-23T10:30:00.000Z"
    }
  ]
}
```

## Implementation Notes
- Projects are deduplicated by path
- Most recently accessed projects appear first
- The feature is integrated with the tab system - switching tabs updates access time
- No performance impact - loading is done once at startup and on focus changes