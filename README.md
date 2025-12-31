# MCP Apple Reminders Server

A [Model Context Protocol (MCP)](https://www.anthropic.com/news/model-context-protocol) server that enables Claude to create and manage reminders in the macOS Reminders app. Perfect for creating shopping lists, todo lists, and batch reminder management.

## Features

- 📝 **Batch Reminder Creation** - Create multiple reminders at once from Claude
- ✅ **Single Reminder Creation** - Add individual reminders with full control
- 📋 **List Management** - Create and view reminder lists
- 🔍 **View Reminders** - List all reminders in any list
- ✔️ **Complete Reminders** - Mark tasks as done
- 🏃‍♂️ **Fully Local** - No API keys needed, runs entirely on your Mac
- 🍎 **Native Integration** - Works directly with Apple Reminders via JXA

## Available Tools

### 1. `create-reminders-batch`
Create multiple reminders at once - perfect for shopping lists or task lists.

**Example use with Claude:**
> "Create a shopping list with: eggs, milk, bread, butter, and cheese"

**Parameters:**
- `listName` (optional): Name of the list (defaults to "Reminders")
- `reminders`: Array of reminder objects with:
  - `title` (required): Reminder title
  - `notes` (optional): Additional notes
  - `dueDate` (optional): ISO 8601 date string
  - `priority` (optional): 0-9 (0=none, 1-4=low, 5=medium, 6-9=high)

### 2. `create-reminder`
Create a single reminder with full control over properties.

**Parameters:**
- `title` (required): Reminder title
- `notes` (optional): Additional details
- `dueDate` (optional): ISO 8601 format (e.g., "2025-12-31T09:00:00")
- `priority` (optional): 0-9
- `listName` (optional): Target list name

### 3. `list-reminder-lists`
Get all reminder lists in the Reminders app.

### 4. `list-reminders`
View all reminders in a specific list.

**Parameters:**
- `listName` (optional): List to view (defaults to "Reminders")

### 5. `create-reminder-list`
Create a new reminder list.

**Parameters:**
- `name` (required): Name of the new list

### 6. `complete-reminder`
Mark a reminder as completed.

**Parameters:**
- `title` (required): Reminder title to complete
- `listName` (optional): List containing the reminder

## Prerequisites

- [Bun](https://bun.sh/docs/installation)
- [Claude Desktop](https://claude.ai/download)
- macOS (required for Apple Reminders integration)

## Installation

1. **Clone the repository:**

```bash
git clone https://github.com/amahaja5/mcp-apple-notes
cd mcp-apple-notes
```

2. **Install dependencies:**

```bash
bun install
```

3. **Configure Claude Desktop:**

Open `Settings → Developer → Edit Config` and add:

```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "/Users/<YOUR_USER_NAME>/.bun/bin/bun",
      "args": ["/Users/<YOUR_USER_NAME>/mcp-apple-notes/index.ts"]
    }
  }
}
```

**Important:** Replace `<YOUR_USER_NAME>` with your actual macOS username and update the path to where you cloned this repo.

4. **Restart Claude Desktop** completely (quit and reopen)

5. **Verify connection**: Look for the 🔌 icon in Claude Desktop showing the MCP server is connected

## Usage Examples

### Example 1: Create a Shopping List
> "Create a shopping list with eggs, milk, bread, butter, cheese, and coffee"

Claude will use `create-reminders-batch` to add all items to a "Shopping" list.

### Example 2: Create Weekly Tasks with Due Dates
> "Create these tasks for this week:
> - Finish project report (due Friday 5pm)
> - Call dentist (due Wednesday)
> - Review code (due Thursday)"

Claude will create reminders with appropriate due dates.

### Example 3: Create High Priority Reminder
> "Remind me to submit the proposal by tomorrow at 2pm, make it high priority"

Claude will create a single reminder with priority 9 and the specified due date.

### Example 4: View Your Tasks
> "Show me all my reminders"

Claude will list all reminders from your default list.

### Example 5: Complete Tasks
> "Mark 'Finish project report' as done"

Claude will complete the specified reminder.

## Date Format

Due dates should be in ISO 8601 format:
- `2025-12-31T09:00:00` - December 31, 2025 at 9:00 AM
- `2025-12-31` - December 31, 2025 (no specific time)

Claude will typically handle date parsing for you when you use natural language like "tomorrow at 2pm".

## Priority Levels

- `0` - No priority
- `1-4` - Low priority (!)
- `5` - Medium priority (!!)
- `6-9` - High priority (!!!)

## Troubleshooting

### Check Logs
```bash
tail -n 50 -f ~/Library/Logs/Claude/mcp-server-apple-reminders.log
# or
tail -n 50 -f ~/Library/Logs/Claude/mcp.log
```

### Common Issues

**MCP server not connecting:**
- Verify paths in `claude_desktop_config.json` are absolute paths
- Check Bun is installed: `which bun`
- Ensure you're on macOS
- Restart Claude Desktop completely

**Reminders not appearing:**
- Check the Reminders app is running
- Verify the list name exists (defaults to "Reminders")
- Check logs for JXA errors

**Permission errors:**
- Grant Claude/Terminal permission to control Reminders in System Settings → Privacy & Security → Automation

## How It Works

1. **JXA Bridge**: Uses JavaScript for Automation to communicate with the Reminders app
2. **MCP Protocol**: Exposes tools that Claude can call via the Model Context Protocol
3. **Batch Processing**: Efficiently creates multiple reminders in sequence
4. **Local Execution**: Everything runs on your Mac - no cloud services needed

## Architecture

```
Claude Desktop
    ↓ (MCP Protocol)
index.ts
    ↓ (JXA/run-jxa)
Apple Reminders App
```

All processing happens locally on your Mac!

## Development

**Run the server directly:**
```bash
bun start
```

**Build the server:**
```bash
bun build
```

**Run tests:**
```bash
bun test
```

## Technical Details

- **Language**: TypeScript
- **Runtime**: Bun
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.0.3
- **Automation**: `run-jxa` v3.0.0 (JavaScript for Automation)
- **Validation**: Zod v3.24.1 for runtime schema validation

## License

ISC

## Contributing

Contributions welcome! This is a community project to enhance Claude's integration with macOS native apps.

---

**Sources for JXA Reminders API:**
- [JXA Reminders Scripting Dictionary](https://github.com/JXA-userland/JXA/blob/master/packages/@jxa/types/tools/sdefs/Reminders.sdef)
- [JXA Examples](https://jxa-examples.akjems.com/)
- [New Reminder Using JXA by Richard Hyde](https://richardhyde.net/2019/04/16/New-Reminder-Using-JXA.html)
- [Reminders JXA CLI Tool](https://github.com/Sangdol/reminders-jxa)
