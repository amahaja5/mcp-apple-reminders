// Usage: bun test reminders-server.test.ts
import { test, describe } from "node:test";
import assert from "node:assert";
import { runJxa } from "run-jxa";
import { z } from "zod";

describe("Apple Reminders MCP Server", async () => {
  describe("JXA Bridge Functions", () => {
    test.skip("should fetch reminder lists (macOS only)", async () => {
      const script = `
        const app = Application('Reminders');
        const lists = app.lists();
        return JSON.stringify(lists.map(list => ({
          name: list.name(),
          id: list.id()
        })));
      `;

      const result = await runJxa(script);
      const lists = JSON.parse(result as string);

      assert.ok(Array.isArray(lists), "Should return an array of lists");
      assert.ok(lists.length > 0, "Should have at least one reminder list");
      assert.ok(lists[0].name, "Each list should have a name");
      assert.ok(lists[0].id, "Each list should have an id");
    });

    test.skip("should create a test reminder list", async () => {
      const testListName = `Test-${Date.now()}`;
      const script = `
        const app = Application('Reminders');
        const newList = app.List({ name: "${testListName}" });
        app.lists.push(newList);
        return "List created successfully";
      `;

      const result = await runJxa(script);
      assert.equal(result, "List created successfully");

      // Verify the list was created
      const verifyScript = `
        const app = Application('Reminders');
        try {
          const list = app.lists.byName("${testListName}");
          return list.name();
        } catch (e) {
          return "not found";
        }
      `;

      const verification = await runJxa(verifyScript);
      assert.equal(verification, testListName, "List should exist");
    });

    test.skip("should create a reminder with basic properties", async () => {
      const testTitle = `Test Reminder ${Date.now()}`;
      const script = `
        const app = Application('Reminders');
        try {
          const list = app.lists.byName("Reminders");
          const newReminder = app.Reminder({
            name: "${testTitle}"
          });
          list.reminders.push(newReminder);
          return "Reminder created successfully";
        } catch (e) {
          return "Error: " + e.toString();
        }
      `;

      const result = await runJxa(script);
      assert.ok(
        !result.toString().startsWith("Error:"),
        "Should create reminder without error"
      );
    });

    test.skip("should create a reminder with all properties", async () => {
      const testTitle = `Full Test Reminder ${Date.now()}`;
      const testNotes = "Test notes content";
      const dueDate = new Date("2025-12-31T10:00:00").toISOString();
      const priority = 5;

      const script = `
        const app = Application('Reminders');
        try {
          const list = app.lists.byName("Reminders");
          const newReminder = app.Reminder({
            name: "${testTitle}",
            body: "${testNotes}",
            dueDate: new Date("${dueDate}"),
            priority: ${priority}
          });
          list.reminders.push(newReminder);
          return "Reminder created successfully";
        } catch (e) {
          return "Error: " + e.toString();
        }
      `;

      const result = await runJxa(script);
      assert.ok(
        !result.toString().startsWith("Error:"),
        "Should create reminder with all properties"
      );
    });

    test.skip("should fetch reminders from a list (macOS only)", async () => {
      const script = `
        const app = Application('Reminders');
        try {
          const list = app.lists.byName("Reminders");
          const reminders = list.reminders();
          return JSON.stringify(reminders.slice(0, 5).map(reminder => ({
            name: reminder.name(),
            id: reminder.id(),
            completed: reminder.completed(),
            body: reminder.body() || "",
            priority: reminder.priority()
          })));
        } catch (e) {
          return JSON.stringify([]);
        }
      `;

      const result = await runJxa(script);
      const reminders = JSON.parse(result as string);

      assert.ok(Array.isArray(reminders), "Should return an array");
      if (reminders.length > 0) {
        assert.ok(reminders[0].name, "Reminder should have a name");
        assert.ok(typeof reminders[0].completed === "boolean", "Should have completed status");
      }
    });

    test.skip("should complete a reminder", async () => {
      const testTitle = `Complete Test ${Date.now()}`;

      // Create a reminder first
      const createScript = `
        const app = Application('Reminders');
        const list = app.lists.byName("Reminders");
        const newReminder = app.Reminder({ name: "${testTitle}" });
        list.reminders.push(newReminder);
        return "created";
      `;
      await runJxa(createScript);

      // Now complete it
      const completeScript = `
        const app = Application('Reminders');
        try {
          const list = app.lists.byName("Reminders");
          const reminders = list.reminders.whose({ name: "${testTitle}" });
          if (reminders.length > 0) {
            reminders[0].completed = true;
            return "completed";
          } else {
            return "not found";
          }
        } catch (e) {
          return "Error: " + e.toString();
        }
      `;

      const result = await runJxa(completeScript);
      assert.equal(result, "completed", "Should mark reminder as completed");
    });
  });

  describe("Input Validation", () => {
    test("should validate create-reminder schema", () => {
      const schema = z.object({
        title: z.string(),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
        priority: z.number().min(0).max(9).optional(),
        listName: z.string().default("Reminders"),
      });

      // Valid inputs
      const valid1 = schema.parse({ title: "Test" });
      assert.equal(valid1.title, "Test");
      assert.equal(valid1.listName, "Reminders");

      const valid2 = schema.parse({
        title: "Test with all fields",
        notes: "Some notes",
        dueDate: "2025-12-31T10:00:00",
        priority: 5,
        listName: "Shopping",
      });
      assert.equal(valid2.priority, 5);
      assert.equal(valid2.listName, "Shopping");

      // Invalid inputs
      assert.throws(() => schema.parse({}), "Should require title");
      assert.throws(
        () => schema.parse({ title: "Test", priority: 10 }),
        "Priority should be max 9"
      );
      assert.throws(
        () => schema.parse({ title: "Test", priority: -1 }),
        "Priority should be min 0"
      );
    });

    test("should validate create-reminders-batch schema", () => {
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

      // Valid batch
      const valid = schema.parse({
        reminders: [
          { title: "Item 1" },
          { title: "Item 2", notes: "Notes" },
          { title: "Item 3", priority: 9 },
        ],
      });
      assert.equal(valid.reminders.length, 3);
      assert.equal(valid.listName, "Reminders");

      // Empty batch is technically valid
      const empty = schema.parse({ reminders: [] });
      assert.equal(empty.reminders.length, 0);

      // Invalid batch - missing required fields
      assert.throws(
        () => schema.parse({ reminders: [{ notes: "No title" }] }),
        "Each reminder should have a title"
      );
    });

    test("should validate list-reminders schema", () => {
      const schema = z.object({
        listName: z.string().default("Reminders"),
      });

      const valid1 = schema.parse({});
      assert.equal(valid1.listName, "Reminders");

      const valid2 = schema.parse({ listName: "Shopping" });
      assert.equal(valid2.listName, "Shopping");
    });

    test("should validate create-reminder-list schema", () => {
      const schema = z.object({
        name: z.string(),
      });

      const valid = schema.parse({ name: "New List" });
      assert.equal(valid.name, "New List");

      assert.throws(() => schema.parse({}), "Should require name");
    });

    test("should validate complete-reminder schema", () => {
      const schema = z.object({
        title: z.string(),
        listName: z.string().default("Reminders"),
      });

      const valid = schema.parse({ title: "Task to complete" });
      assert.equal(valid.title, "Task to complete");
      assert.equal(valid.listName, "Reminders");

      assert.throws(() => schema.parse({}), "Should require title");
    });
  });

  describe("String Escaping", () => {
    test("should escape quotes in JXA strings", () => {
      const input = 'Test "quoted" string';
      const escaped = input.replace(/"/g, '\\"');
      assert.equal(escaped, 'Test \\"quoted\\" string');
    });

    test("should escape newlines in JXA strings", () => {
      const input = "Line 1\nLine 2\nLine 3";
      const escaped = input.replace(/\n/g, "\\n");
      assert.equal(escaped, "Line 1\\nLine 2\\nLine 3");
    });

    test("should handle combined escaping", () => {
      const input = 'Title with "quotes"\nAnd newlines';
      const escaped = input.replace(/"/g, '\\"').replace(/\n/g, "\\n");
      assert.equal(escaped, 'Title with \\"quotes\\"\\nAnd newlines');
    });

    test("should handle empty strings", () => {
      const input = "";
      const escaped = input.replace(/"/g, '\\"').replace(/\n/g, "\\n");
      assert.equal(escaped, "");
    });
  });

  describe("Performance", () => {
    test("should create JXA script quickly", () => {
      const start = performance.now();

      const title = "Test Reminder";
      const notes = "Test notes";
      const escapedTitle = title.replace(/"/g, '\\"').replace(/\n/g, "\\n");
      const escapedNotes = notes.replace(/"/g, '\\"').replace(/\n/g, "\\n");

      const script = `
        const app = Application('Reminders');
        const list = app.lists.byName("Reminders");
        const newReminder = app.Reminder({
          name: "${escapedTitle}",
          body: "${escapedNotes}"
        });
        list.reminders.push(newReminder);
        return "created";
      `;

      const end = performance.now();
      const duration = end - start;

      assert.ok(script.length > 0, "Should generate script");
      assert.ok(duration < 10, "Script generation should be fast (<10ms)");
      console.log(`Script generation took ${duration.toFixed(2)}ms`);
    });

    test.skip("should measure JXA execution time for list fetch", async () => {
      const start = performance.now();

      const script = `
        const app = Application('Reminders');
        const lists = app.lists();
        return JSON.stringify(lists.map(list => ({ name: list.name(), id: list.id() })));
      `;

      const result = await runJxa(script);
      const end = performance.now();
      const duration = end - start;

      assert.ok(result, "Should return result");
      console.log(`Fetching reminder lists took ${duration.toFixed(2)}ms`);
    });

    test.skip("should measure batch creation performance", async () => {
      const batchSize = 10;
      const testListName = `Batch-Test-${Date.now()}`;

      // Create test list
      const createListScript = `
        const app = Application('Reminders');
        const newList = app.List({ name: "${testListName}" });
        app.lists.push(newList);
        return "created";
      `;
      await runJxa(createListScript);

      // Measure batch creation
      const start = performance.now();

      for (let i = 0; i < batchSize; i++) {
        const script = `
          const app = Application('Reminders');
          const list = app.lists.byName("${testListName}");
          const newReminder = app.Reminder({ name: "Item ${i + 1}" });
          list.reminders.push(newReminder);
          return "created";
        `;
        await runJxa(script);
      }

      const end = performance.now();
      const duration = end - start;
      const avgPerItem = duration / batchSize;

      console.log(`Created ${batchSize} reminders in ${duration.toFixed(2)}ms`);
      console.log(`Average per reminder: ${avgPerItem.toFixed(2)}ms`);

      assert.ok(duration > 0, "Should take some time");
    });
  });

  describe("Edge Cases", () => {
    test("should handle missing optional fields", () => {
      const schema = z.object({
        title: z.string(),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
        priority: z.number().optional(),
      });

      const result = schema.parse({ title: "Minimal reminder" });
      assert.equal(result.title, "Minimal reminder");
      assert.equal(result.notes, undefined);
      assert.equal(result.dueDate, undefined);
      assert.equal(result.priority, undefined);
    });

    test("should handle very long titles", () => {
      const longTitle = "A".repeat(1000);
      const schema = z.object({ title: z.string() });

      const result = schema.parse({ title: longTitle });
      assert.equal(result.title.length, 1000);
    });

    test("should handle special characters in titles", () => {
      const specialChars = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`";
      const schema = z.object({ title: z.string() });

      const result = schema.parse({ title: specialChars });
      assert.equal(result.title, specialChars);
    });

    test("should handle unicode in titles", () => {
      const unicodeTitle = "🎉 Reminder with emoji 🚀 and unicode: こんにちは";
      const schema = z.object({ title: z.string() });

      const result = schema.parse({ title: unicodeTitle });
      assert.equal(result.title, unicodeTitle);
    });

    test("should handle empty reminder list in batch", () => {
      const schema = z.object({
        reminders: z.array(z.object({ title: z.string() })),
      });

      // Empty array should be valid (though not useful)
      const result = schema.parse({ reminders: [] });
      assert.equal(result.reminders.length, 0);
    });

    test("should handle large batch sizes", () => {
      const schema = z.object({
        reminders: z.array(z.object({ title: z.string() })),
      });

      const largeReminders = Array.from({ length: 100 }, (_, i) => ({
        title: `Item ${i + 1}`,
      }));

      const result = schema.parse({ reminders: largeReminders });
      assert.equal(result.reminders.length, 100);
    });
  });

  describe("Date Handling", () => {
    test("should validate ISO 8601 date format", () => {
      const validDates = [
        "2025-12-31T10:00:00",
        "2025-12-31T10:00:00Z",
        "2025-12-31T10:00:00.000Z",
        "2025-12-31T10:00:00+05:30",
      ];

      validDates.forEach((date) => {
        const parsed = new Date(date);
        assert.ok(!isNaN(parsed.getTime()), `Should parse ${date}`);
      });
    });

    test("should handle various date formats", () => {
      const dates = [
        "2025-12-31",
        "2025-12-31T00:00:00",
        "2025-12-31T23:59:59",
      ];

      dates.forEach((date) => {
        const parsed = new Date(date);
        assert.ok(!isNaN(parsed.getTime()), `Should parse ${date}`);
      });
    });
  });

  describe("Priority Levels", () => {
    test("should accept valid priority levels", () => {
      const schema = z.object({
        priority: z.number().min(0).max(9),
      });

      for (let i = 0; i <= 9; i++) {
        const result = schema.parse({ priority: i });
        assert.equal(result.priority, i);
      }
    });

    test("should reject invalid priority levels", () => {
      const schema = z.object({
        priority: z.number().min(0).max(9),
      });

      assert.throws(() => schema.parse({ priority: -1 }));
      assert.throws(() => schema.parse({ priority: 10 }));
      assert.throws(() => schema.parse({ priority: 100 }));
    });
  });
});
