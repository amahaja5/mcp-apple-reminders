#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { runJxa } from "run-jxa";
import { z } from "zod";

/**
 * MCP Server for Apple Reminders
 * Enables Claude to create and manage reminders in the macOS Reminders app
 */

// Types
interface ReminderList {
  name: string;
  id: string;
}

interface Reminder {
  name: string;
  id: string;
  body?: string;
  completed: boolean;
  dueDate?: string;
  priority?: number;
  completionDate?: string;
  creationDate?: string;
  modificationDate?: string;
}

interface CreateReminderInput {
  title: string;
  notes?: string;
  dueDate?: string; // ISO 8601 format
  priority?: number; // 0 (none) to 9 (high)
  listName?: string; // defaults to "Reminders"
}

// JXA Bridge Functions

/**
 * Get all reminder lists
 */
async function getReminderLists(): Promise<ReminderList[]> {
  const script = `
    const app = Application('Reminders');
    const lists = app.lists();
    return JSON.stringify(lists.map(list => ({
      name: list.name(),
      id: list.id()
    })));
  `;

  try {
    const result = await runJxa(script);
    return JSON.parse(result as string);
  } catch (error) {
    console.error("Error fetching reminder lists:", error);
    return [];
  }
}

/**
 * Get reminders from a specific list
 */
async function getReminders(listName: string): Promise<Reminder[]> {
  const escapedListName = listName.replace(/"/g, '\\"');
  const script = `
    const app = Application('Reminders');
    try {
      const list = app.lists.byName("${escapedListName}");
      const reminders = list.reminders();
      return JSON.stringify(reminders.map(reminder => ({
        name: reminder.name(),
        id: reminder.id(),
        body: reminder.body() || "",
        completed: reminder.completed(),
        dueDate: reminder.dueDate() ? reminder.dueDate().toISOString() : null,
        priority: reminder.priority(),
        completionDate: reminder.completionDate() ? reminder.completionDate().toISOString() : null,
        creationDate: reminder.creationDate() ? reminder.creationDate().toISOString() : null,
        modificationDate: reminder.modificationDate() ? reminder.modificationDate().toISOString() : null
      })));
    } catch (e) {
      return JSON.stringify([]);
    }
  `;

  try {
    const result = await runJxa(script);
    return JSON.parse(result as string);
  } catch (error) {
    console.error(`Error fetching reminders from list "${listName}":`, error);
    return [];
  }
}

/**
 * Create a new reminder list
 */
async function createReminderList(name: string): Promise<string> {
  const escapedName = name.replace(/"/g, '\\"');
  const script = `
    const app = Application('Reminders');
    const newList = app.List({ name: "${escapedName}" });
    app.lists.push(newList);
    return "List created successfully";
  `;

  try {
    await runJxa(script);
    return `Created reminder list: "${name}"`;
  } catch (error) {
    throw new Error(`Failed to create reminder list: ${error}`);
  }
}

/**
 * Create a single reminder
 */
async function createReminder(input: CreateReminderInput): Promise<string> {
  const { title, notes, dueDate, priority, listName = "Reminders" } = input;

  // Escape strings for JXA
  const escapedTitle = title.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const escapedNotes = notes ? notes.replace(/"/g, '\\"').replace(/\n/g, '\\n') : "";
  const escapedListName = listName.replace(/"/g, '\\"');

  // Build the properties object
  const properties: string[] = [`name: "${escapedTitle}"`];

  if (escapedNotes) {
    properties.push(`body: "${escapedNotes}"`);
  }

  if (dueDate) {
    properties.push(`dueDate: new Date("${dueDate}")`);
  }

  if (priority !== undefined) {
    properties.push(`priority: ${priority}`);
  }

  const script = `
    const app = Application('Reminders');
    try {
      const list = app.lists.byName("${escapedListName}");
      const newReminder = app.Reminder({
        ${properties.join(',\n        ')}
      });
      list.reminders.push(newReminder);
      return "Reminder created successfully";
    } catch (e) {
      return "Error: " + e.toString();
    }
  `;

  try {
    const result = await runJxa(script);
    if (typeof result === 'string' && result.startsWith('Error:')) {
      throw new Error(result);
    }
    return `Created reminder: "${title}" in list "${listName}"`;
  } catch (error) {
    throw new Error(`Failed to create reminder: ${error}`);
  }
}

/**
 * Create multiple reminders at once (batch creation)
 */
async function createRemindersBatch(
  reminders: CreateReminderInput[],
  listName: string = "Reminders"
): Promise<string> {
  const results: string[] = [];
  const errors: string[] = [];

  for (const reminder of reminders) {
    try {
      const result = await createReminder({ ...reminder, listName });
      results.push(result);
    } catch (error) {
      errors.push(`Failed to create "${reminder.title}": ${error}`);
    }
  }

  const summary = [
    `Successfully created ${results.length} of ${reminders.length} reminders in "${listName}"`,
  ];

  if (errors.length > 0) {
    summary.push(`\nErrors:\n${errors.join('\n')}`);
  }

  return summary.join('\n');
}

/**
 * Complete a reminder by name
 */
async function completeReminder(title: string, listName: string = "Reminders"): Promise<string> {
  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedListName = listName.replace(/"/g, '\\"');

  const script = `
    const app = Application('Reminders');
    try {
      const list = app.lists.byName("${escapedListName}");
      const reminders = list.reminders.whose({ name: "${escapedTitle}" });
      if (reminders.length > 0) {
        reminders[0].completed = true;
        return "Reminder completed";
      } else {
        return "Reminder not found";
      }
    } catch (e) {
      return "Error: " + e.toString();
    }
  `;

  try {
    const result = await runJxa(script);
    if (typeof result === 'string' && result.startsWith('Error:')) {
      throw new Error(result);
    }
    return `Marked "${title}" as completed in "${listName}"`;
  } catch (error) {
    throw new Error(`Failed to complete reminder: ${error}`);
  }
}

// MCP Server Setup

const server = new Server(
  {
    name: "apple-reminders-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list-reminder-lists",
        description: "List all reminder lists in the Reminders app",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list-reminders",
        description: "List all reminders in a specific list",
        inputSchema: {
          type: "object",
          properties: {
            listName: {
              type: "string",
              description: "Name of the reminder list (defaults to 'Reminders')",
            },
          },
        },
      },
      {
        name: "create-reminder-list",
        description: "Create a new reminder list",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the new reminder list",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "create-reminder",
        description: "Create a single reminder in the Reminders app",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title of the reminder",
            },
            notes: {
              type: "string",
              description: "Additional notes/details for the reminder",
            },
            dueDate: {
              type: "string",
              description: "Due date in ISO 8601 format (e.g., '2025-12-31T09:00:00')",
            },
            priority: {
              type: "number",
              description: "Priority level (0=none, 1-4=low, 5=medium, 6-9=high)",
            },
            listName: {
              type: "string",
              description: "Name of the list to add the reminder to (defaults to 'Reminders')",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "create-reminders-batch",
        description: "Create multiple reminders at once from a list. Perfect for creating shopping lists, todo lists, or any batch of tasks.",
        inputSchema: {
          type: "object",
          properties: {
            listName: {
              type: "string",
              description: "Name of the list to add all reminders to (defaults to 'Reminders')",
            },
            reminders: {
              type: "array",
              description: "Array of reminders to create",
              items: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Title of the reminder",
                  },
                  notes: {
                    type: "string",
                    description: "Additional notes for the reminder",
                  },
                  dueDate: {
                    type: "string",
                    description: "Due date in ISO 8601 format",
                  },
                  priority: {
                    type: "number",
                    description: "Priority level (0-9)",
                  },
                },
                required: ["title"],
              },
            },
          },
          required: ["reminders"],
        },
      },
      {
        name: "complete-reminder",
        description: "Mark a reminder as completed",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title of the reminder to complete",
            },
            listName: {
              type: "string",
              description: "Name of the list containing the reminder (defaults to 'Reminders')",
            },
          },
          required: ["title"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "list-reminder-lists": {
        const lists = await getReminderLists();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(lists, null, 2),
            },
          ],
        };
      }

      case "list-reminders": {
        const schema = z.object({
          listName: z.string().default("Reminders"),
        });
        const { listName } = schema.parse(args);
        const reminders = await getReminders(listName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(reminders, null, 2),
            },
          ],
        };
      }

      case "create-reminder-list": {
        const schema = z.object({
          name: z.string(),
        });
        const { name } = schema.parse(args);
        const result = await createReminderList(name);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "create-reminder": {
        const schema = z.object({
          title: z.string(),
          notes: z.string().optional(),
          dueDate: z.string().optional(),
          priority: z.number().min(0).max(9).optional(),
          listName: z.string().default("Reminders"),
        });
        const input = schema.parse(args);
        const result = await createReminder(input);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "create-reminders-batch": {
        const schema = z.object({
          listName: z.string().default("Reminders"),
          reminders: z.array(
            z.object({
              title: z.string(),
              notes: z.string().optional(),
              dueDate: z.string().optional(),
              priority: z.number().min(0).max(9).optional(),
            })
          ),
        });
        const { listName, reminders } = schema.parse(args);
        const result = await createRemindersBatch(reminders, listName);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "complete-reminder": {
        const schema = z.object({
          title: z.string(),
          listName: z.string().default("Reminders"),
        });
        const { title, listName } = schema.parse(args);
        const result = await completeReminder(title, listName);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
      );
    }
    throw error;
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Apple Reminders MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
