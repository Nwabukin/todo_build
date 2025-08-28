#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";

const DEFAULT_PATH = path.join(os.homedir(), "Documents", "tasks.json");
const TASK_FILE_PATH = process.env.TASK_MANAGER_FILE_PATH || DEFAULT_PATH;

interface Subtask {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  createdAt: string;
  completedAt?: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  done: boolean;
  approved: boolean;
  completedDetails: string;
  subtasks?: Subtask[]; // Optional subtasks for complex tasks
  completionPercentage?: number; // Calculated from subtasks if present
}

interface RequestEntry {
  requestId: string;
  originalRequest: string;
  splitDetails: string;
  tasks: Task[];
  completed: boolean; // marked true after all tasks done and request completion approved
}

interface TaskManagerFile {
  requests: RequestEntry[];
}

// Zod Schemas
const RequestPlanningSchema = z.object({
  originalRequest: z.string(),
  splitDetails: z.string().optional(),
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    })
  ),
});

// Subtask Management Schemas
const SubtaskSchema = z.object({
  id: z.string().optional(),
  content: z.string()
    .min(1, "Subtask content cannot be empty")
    .max(500, "Subtask content cannot exceed 500 characters")
    .trim()
    .refine(content => content.length > 0, {
      message: "Subtask content cannot be only whitespace"
    }),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).default("pending"),
});

const ManageSubtasksSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  action: z.enum(["create", "update", "complete", "delete", "break_down"]),
  subtasks: z.array(SubtaskSchema)
    .max(50, "Cannot create more than 50 subtasks at once")
    .optional(),
  subtaskId: z.string().optional(),
  updates: z.object({
    content: z.string()
      .min(1, "Content cannot be empty")
      .max(500, "Content cannot exceed 500 characters")
      .trim()
      .optional(),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  }).optional(),
}).refine((data) => {
  // Action-specific validation
  switch (data.action) {
    case "create":
      if (!data.subtasks || data.subtasks.length === 0) {
        return false;
      }
      break;
    case "update":
      if (!data.subtaskId || !data.updates || (!data.updates.content && !data.updates.status)) {
        return false;
      }
      break;
    case "complete":
    case "delete":
      if (!data.subtaskId) {
        return false;
      }
      break;
    case "break_down":
      if (!data.subtasks || data.subtasks.length === 0) {
        return false;
      }
      break;
  }
  return true;
}, {
  message: "Missing required parameters for this action"
});

const GetNextTaskSchema = z.object({
  requestId: z.string(),
});

const MarkTaskDoneSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  completedDetails: z.string().optional(),
});

const ApproveTaskCompletionSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
});

const ApproveRequestCompletionSchema = z.object({
  requestId: z.string(),
});

const OpenTaskDetailsSchema = z.object({
  taskId: z.string(),
});

const ListRequestsSchema = z.object({});

const AddTasksToRequestSchema = z.object({
  requestId: z.string(),
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
    })
  ),
});

const UpdateTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const DeleteTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
});

const ClearAllTasksSchema = z.object({});

// Tools with enriched English descriptions

const REQUEST_PLANNING_TOOL: Tool = {
  name: "request_planning",
  description:
    "Register a new user request and plan its associated tasks. You must provide 'originalRequest' and 'tasks', and optionally 'splitDetails'.\n\n" +
    "This tool initiates a new workflow for handling a user's request. The workflow is as follows:\n" +
    "1. Use 'request_planning' to register a request and its tasks.\n" +
    "2. After adding tasks, you MUST use 'get_next_task' to retrieve the first task. A progress table will be displayed.\n" +
    "3. Use 'get_next_task' to retrieve the next uncompleted task.\n" +
    "4. **IMPORTANT:** After marking a task as done, the assistant MUST NOT proceed to another task without the user's approval. The user must explicitly approve the completed task using 'approve_task_completion'. A progress table will be displayed before each approval request.\n" +
    "5. Once a task is approved, you can proceed to 'get_next_task' again to fetch the next pending task.\n" +
    "6. Repeat this cycle until all tasks are done.\n" +
    "7. After all tasks are completed (and approved), 'get_next_task' will indicate that all tasks are done and that the request awaits approval for full completion.\n" +
    "8. The user must then approve the entire request's completion using 'approve_request_completion'. If the user does not approve and wants more tasks, you can again use 'request_planning' to add new tasks and continue the cycle.\n\n" +
    "The critical point is to always wait for user approval after completing each task and after all tasks are done, wait for request completion approval. Do not proceed automatically.",
  inputSchema: {
    type: "object",
    properties: {
      originalRequest: { type: "string" },
      splitDetails: { type: "string" },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
          required: ["title", "description"],
        },
      },
    },
    required: ["originalRequest", "tasks"],
  },
};

const GET_NEXT_TASK_TOOL: Tool = {
  name: "get_next_task",
  description:
    "Given a 'requestId', return the next pending task (not done yet). If all tasks are completed, it will indicate that no more tasks are left and that you must wait for the request completion approval.\n\n" +
    "A progress table showing the current status of all tasks will be displayed with each response.\n\n" +
    "If the same task is returned again or if no new task is provided after a task was marked as done but not yet approved, you MUST NOT proceed. In such a scenario, you must prompt the user for approval via 'approve_task_completion' before calling 'get_next_task' again. Do not skip the user's approval step.\n" +
    "In other words:\n" +
    "- After calling 'mark_task_done', do not call 'get_next_task' again until 'approve_task_completion' is called by the user.\n" +
    "- If 'get_next_task' returns 'all_tasks_done', it means all tasks have been completed. At this point, you must not start a new request or do anything else until the user decides to 'approve_request_completion' or possibly add more tasks via 'request_planning'.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
    },
    required: ["requestId"],
  },
};

const MARK_TASK_DONE_TOOL: Tool = {
  name: "mark_task_done",
  description:
    "Mark a given task as done after you've completed it. Provide 'requestId' and 'taskId', and optionally 'completedDetails'.\n\n" +
    "After marking a task as done, a progress table will be displayed showing the updated status of all tasks.\n\n" +
    "After this, DO NOT proceed to 'get_next_task' again until the user has explicitly approved this completed task using 'approve_task_completion'.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      taskId: { type: "string" },
      completedDetails: { type: "string" },
    },
    required: ["requestId", "taskId"],
  },
};

const APPROVE_TASK_COMPLETION_TOOL: Tool = {
  name: "approve_task_completion",
  description:
    "Once the assistant has marked a task as done using 'mark_task_done', the user must call this tool to approve that the task is genuinely completed. Only after this approval can you proceed to 'get_next_task' to move on.\n\n" +
    "A progress table will be displayed before requesting approval, showing the current status of all tasks.\n\n" +
    "If the user does not approve, do not call 'get_next_task'. Instead, the user may request changes, or even re-plan tasks by using 'request_planning' again.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      taskId: { type: "string" },
    },
    required: ["requestId", "taskId"],
  },
};

const APPROVE_REQUEST_COMPLETION_TOOL: Tool = {
  name: "approve_request_completion",
  description:
    "After all tasks are done and approved, this tool finalizes the entire request. The user must call this to confirm that the request is fully completed.\n\n" +
    "A progress table showing the final status of all tasks will be displayed before requesting final approval.\n\n" +
    "If not approved, the user can add new tasks using 'request_planning' and continue the process.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
    },
    required: ["requestId"],
  },
};

const OPEN_TASK_DETAILS_TOOL: Tool = {
  name: "open_task_details",
  description:
    "Get details of a specific task by 'taskId'. This is for inspecting task information at any point.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string" },
    },
    required: ["taskId"],
  },
};

const LIST_REQUESTS_TOOL: Tool = {
  name: "list_requests",
  description:
    "List all requests with their basic information and summary of tasks. This provides a quick overview of all requests in the system.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const ADD_TASKS_TO_REQUEST_TOOL: Tool = {
  name: "add_tasks_to_request",
  description:
    "Add new tasks to an existing request. This allows extending a request with additional tasks.\n\n" +
    "A progress table will be displayed showing all tasks including the newly added ones.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
          required: ["title", "description"],
        },
      },
    },
    required: ["requestId", "tasks"],
  },
};

const UPDATE_TASK_TOOL: Tool = {
  name: "update_task",
  description:
    "Update an existing task's title and/or description. Only uncompleted tasks can be updated.\n\n" +
    "A progress table will be displayed showing the updated task information.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      taskId: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
    },
    required: ["requestId", "taskId"],
  },
};

const DELETE_TASK_TOOL: Tool = {
  name: "delete_task",
  description:
    "Delete a specific task from a request. Only uncompleted tasks can be deleted.\n\n" +
    "A progress table will be displayed showing the remaining tasks after deletion.",
  inputSchema: {
    type: "object",
    properties: {
      requestId: { type: "string" },
      taskId: { type: "string" },
    },
    required: ["requestId", "taskId"],
  },
};

const CLEAR_ALL_TASKS_TOOL: Tool = {
  name: "clear_all_tasks",
  description:
    "Clear all tasks and requests from the task manager, including completed tasks. This will completely empty the task manager.\n\n" +
    "This is a destructive operation that cannot be undone. All requests and their associated tasks will be permanently deleted.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

// Subtask Management Tool
const MANAGE_SUBTASKS_TOOL: Tool = {
  name: "manage_subtasks",
  description:
    "Create and manage subtasks for complex tasks, similar to todo_write functionality. Supports breaking down tasks, updating status, and tracking completion.\n\n" +
    "Actions:\n" +
    "- 'create': Add new subtasks to a task\n" +
    "- 'update': Modify existing subtask content or status\n" +
    "- 'complete': Mark a subtask as completed\n" +
    "- 'delete': Remove a subtask\n" +
    "- 'break_down': Convert a simple task into a task with subtasks\n\n" +
    "This tool enables granular progress tracking by breaking complex tasks into manageable subtasks.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "ID of the parent task" },
      action: {
        type: "string",
        enum: ["create", "update", "complete", "delete", "break_down"],
        description: "Action to perform"
      },
      subtasks: {
        type: "array",
        description: "Array of subtasks (for create/break_down actions)",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Optional subtask ID" },
            content: { type: "string", description: "Subtask description" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
              description: "Subtask status"
            }
          }
        }
      },
      subtaskId: { type: "string", description: "ID of subtask to update/delete" },
            updates: {
              type: "object",
        description: "Updates for existing subtask",
              properties: {
          content: { type: "string", description: "New content" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed", "cancelled"],
            description: "New status"
          }
        }
      }
    },
    required: ["taskId", "action"]
  },
};

class TaskManagerServer {
  private requestCounter = 0;
  private taskCounter = 0;
  private data: TaskManagerFile = { requests: [] };

  constructor() {
    this.loadTasks();
  }

  private async loadTasks() {
    try {
      const data = await fs.readFile(TASK_FILE_PATH, "utf-8");
      this.data = JSON.parse(data);
      const allTaskIds: number[] = [];
      const allRequestIds: number[] = [];

      for (const req of this.data.requests) {
        const reqNum = Number.parseInt(req.requestId.replace("req-", ""), 10);
        if (!Number.isNaN(reqNum)) {
          allRequestIds.push(reqNum);
        }
        for (const t of req.tasks) {
          // Extract global counter from compound ID (req-X-task-Y-subtask-Z)
          // We take the highest number from any subtask ID to maintain global uniqueness
          if (t.subtasks && t.subtasks.length > 0) {
            for (const st of t.subtasks) {
              const subtaskMatch = st.id.match(/-subtask-(\d+)$/);
              if (subtaskMatch) {
                const subtaskNum = Number.parseInt(subtaskMatch[1], 10);
                if (!Number.isNaN(subtaskNum)) {
                  allTaskIds.push(subtaskNum);
                }
              }
            }
          }
        }
      }

      this.requestCounter =
        allRequestIds.length > 0 ? Math.max(...allRequestIds) : 0;
      this.taskCounter = allTaskIds.length > 0 ? Math.max(...allTaskIds) : 0;
    } catch (error) {
      this.data = { requests: [] };
    }
  }

  private async saveTasks() {
    try {
      await fs.writeFile(
        TASK_FILE_PATH,
        JSON.stringify(this.data, null, 2),
        "utf-8"
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("EROFS")) {
        console.error("EROFS: read-only file system. Cannot save tasks.");
        throw error;
      }
      throw error;
    }
  }

  private formatTaskProgressTable(requestId: string): string {
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return "Request not found";

    let table = "\nProgress Status:\n";
    table += "| Task # | Title | Description | Status | Progress | Approval |\n";
    table += "|--------|--------|------|------|----------|----------|\n";

    for (const task of req.tasks) {
      const status = task.done ? "✅ Done" : "🔄 In Progress";
      const approved = task.approved ? "✅ Approved" : "⏳ Pending";

      // Extract clean task number from compound ID (e.g., "req-1-task-2" → "Task 2")
      const taskMatch = task.id.match(/-task-(\d+)$/);
      const taskDisplay = taskMatch ? `Task ${taskMatch[1]}` : task.id;

      // Show completion percentage if task has subtasks
      let progress = "";
      if (task.subtasks && task.subtasks.length > 0) {
        const percentage = task.completionPercentage || 0;
        progress = `${percentage}%`;
        if (percentage === 100) progress += " ✅";
      } else {
        progress = "N/A";
      }

      table += `| ${taskDisplay} | ${task.title} | ${task.description} | ${status} | ${progress} | ${approved} |\n`;

      // Show subtasks if they exist
      if (task.subtasks && task.subtasks.length > 0) {
        // Sort subtasks by creation time for consistent ordering
        const sortedSubtasks = [...task.subtasks].sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        for (let i = 0; i < sortedSubtasks.length; i++) {
          const subtask = sortedSubtasks[i];
          const subtaskStatus = subtask.status === "completed" ? "✅" :
                               subtask.status === "in_progress" ? "🔄" :
                               subtask.status === "cancelled" ? "❌" : "⏳";

          // Show sequential subtask numbers within each task (Subtask 1, Subtask 2, etc.)
          const subtaskDisplay = `Subtask ${i + 1}`;

          table += `| └─ ${subtaskDisplay} | ${subtask.content.substring(0, 30)}${subtask.content.length > 30 ? "..." : ""} | ${subtaskStatus} | ${subtask.status} | |\n`;
        }
      }
    }

    return table;
  }

  private formatRequestsList(): string {
    let output = "\nRequests List:\n";
    output +=
      "| Request ID | Original Request | Total Tasks | Completed | Approved |\n";
    output +=
      "|------------|------------------|-------------|-----------|----------|\n";

    for (const req of this.data.requests) {
      const totalTasks = req.tasks.length;
      const completedTasks = req.tasks.filter((t) => t.done).length;
      const approvedTasks = req.tasks.filter((t) => t.approved).length;
      output += `| ${req.requestId} | ${req.originalRequest.substring(0, 30)}${req.originalRequest.length > 30 ? "..." : ""} | ${totalTasks} | ${completedTasks} | ${approvedTasks} |\n`;
    }

    return output;
  }

  public async requestPlanning(
    originalRequest: string,
    tasks: { title: string; description: string }[],
    splitDetails?: string
  ) {
    await this.loadTasks();
    this.requestCounter += 1;
    const requestId = `req-${this.requestCounter}`;

    const newTasks: Task[] = [];
    // Reset task counter for each request to start fresh
    let requestTaskCounter = 1;

    for (const taskDef of tasks) {
      this.taskCounter += 1; // Keep global counter for uniqueness
      newTasks.push({
        id: `req-${requestId}-task-${requestTaskCounter}`,
        title: taskDef.title,
        description: taskDef.description,
        done: false,
        approved: false,
        completedDetails: "",
      });
      requestTaskCounter++;
    }

    this.data.requests.push({
      requestId,
      originalRequest,
      splitDetails: splitDetails || originalRequest,
      tasks: newTasks,
      completed: false,
    });

    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);

    return {
      status: "planned",
      requestId,
      totalTasks: newTasks.length,
      tasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
      message: `Tasks have been successfully added. Please use 'get_next_task' to retrieve the first task.\n${progressTable}`,
    };
  }

  public async getNextTask(requestId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) {
      return { status: "error", message: "Request not found" };
    }
    if (req.completed) {
      return {
        status: "already_completed",
        message: "Request already completed.",
      };
    }
    const nextTask = req.tasks.find((t) => !t.done);
    if (!nextTask) {
      // all tasks done?
      const allDone = req.tasks.every((t) => t.done);
      if (allDone && !req.completed) {
        const progressTable = this.formatTaskProgressTable(requestId);
        return {
          status: "all_tasks_done",
          message: `All tasks have been completed. Awaiting request completion approval.\n${progressTable}`,
        };
      }
      return { status: "no_next_task", message: "No undone tasks found." };
    }

    const progressTable = this.formatTaskProgressTable(requestId);
    // Extract display number for the task
    const taskMatch = nextTask.id.match(/-task-(\d+)$/);
    const taskDisplayNumber = taskMatch ? parseInt(taskMatch[1]) : null;

    return {
      status: "next_task",
      task: {
        id: nextTask.id,
        displayNumber: taskDisplayNumber,
        title: nextTask.title,
        description: nextTask.description,
      },
      message: `Next task ${taskDisplayNumber ? `(${taskDisplayNumber}) ` : ''}is ready. Task approval will be required after completion.\n${progressTable}`,
    };
  }

  public async markTaskDone(
    requestId: string,
    taskId: string,
    completedDetails?: string
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.done)
      return {
        status: "already_done",
        message: "Task is already marked done.",
      };

    // If task has subtasks, check if all are completed
    if (task.subtasks && task.subtasks.length > 0) {
      const allCompleted = task.subtasks.every(st => st.status === "completed");
      if (!allCompleted) {
        const completionPercentage = task.completionPercentage || 0;
        return {
          status: "subtasks_incomplete",
          message: `Cannot mark task as done. ${completionPercentage}% of subtasks completed. Complete all subtasks first.`,
          completionPercentage,
          remainingSubtasks: task.subtasks.filter(st => st.status !== "completed").length
        };
      }
    }

    task.done = true;
    task.completedDetails = completedDetails || "";
    await this.saveTasks();
    // Extract display number for the task
    const taskMatch = task.id.match(/-task-(\d+)$/);
    const taskDisplayNumber = taskMatch ? parseInt(taskMatch[1]) : null;

    return {
      status: "task_marked_done",
      requestId: req.requestId,
      task: {
        id: task.id,
        displayNumber: taskDisplayNumber,
        title: task.title,
        description: task.description,
        completedDetails: task.completedDetails,
        approved: task.approved,
        completionPercentage: task.completionPercentage,
        subtasks: task.subtasks?.map((st, index) => ({
          ...st,
          displayNumber: index + 1
        }))
      },
    };
  }

  public async approveTaskCompletion(requestId: string, taskId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (!task.done) return { status: "error", message: "Task not done yet." };
    if (task.approved)
      return { status: "already_approved", message: "Task already approved." };

    task.approved = true;
    await this.saveTasks();
    return {
      status: "task_approved",
      requestId: req.requestId,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completedDetails: task.completedDetails,
        approved: task.approved,
      },
    };
  }

  public async approveRequestCompletion(requestId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    // Check if all tasks are done and approved
    const allDone = req.tasks.every((t) => t.done);
    if (!allDone) {
      return { status: "error", message: "Not all tasks are done." };
    }
    const allApproved = req.tasks.every((t) => t.done && t.approved);
    if (!allApproved) {
      return { status: "error", message: "Not all done tasks are approved." };
    }

    req.completed = true;
    await this.saveTasks();
    return {
      status: "request_approved_complete",
      requestId: req.requestId,
      message: "Request is fully completed and approved.",
    };
  }

  public async openTaskDetails(taskId: string) {
    await this.loadTasks();
    for (const req of this.data.requests) {
      const target = req.tasks.find((t) => t.id === taskId);
      if (target) {
        // Extract display number for the task
        const taskMatch = target.id.match(/-task-(\d+)$/);
        const taskDisplayNumber = taskMatch ? parseInt(taskMatch[1]) : null;

        return {
          status: "task_details",
          requestId: req.requestId,
          originalRequest: req.originalRequest,
          splitDetails: req.splitDetails,
          completed: req.completed,
          task: {
            id: target.id,
            displayNumber: taskDisplayNumber,
            title: target.title,
            description: target.description,
            done: target.done,
            approved: target.approved,
            completedDetails: target.completedDetails,
            completionPercentage: target.completionPercentage,
            subtasks: target.subtasks?.map((st, index) => ({
              ...st,
              displayNumber: index + 1
            })),
          },
        };
      }
    }
    return { status: "task_not_found", message: "No such task found" };
  }

  public async listRequests() {
    await this.loadTasks();
    const requestsList = this.formatRequestsList();
    return {
      status: "requests_listed",
      message: `Current requests in the system:\n${requestsList}`,
      requests: this.data.requests.map((req) => ({
        requestId: req.requestId,
        originalRequest: req.originalRequest,
        totalTasks: req.tasks.length,
        completedTasks: req.tasks.filter((t) => t.done).length,
        approvedTasks: req.tasks.filter((t) => t.approved).length,
      })),
    };
  }

  public async addTasksToRequest(
    requestId: string,
    tasks: { title: string; description: string }[]
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };
    if (req.completed)
      return {
        status: "error",
        message: "Cannot add tasks to completed request",
      };

    const newTasks: Task[] = [];
    // Find the next task number for this request
    const existingTasks = req.tasks;
    const maxTaskNum = existingTasks.length > 0
      ? Math.max(...existingTasks.map(t =>
          parseInt(t.id.split('-task-')[1]) || 0
        ))
      : 0;
    let nextTaskNum = maxTaskNum + 1;

    for (const taskDef of tasks) {
      this.taskCounter += 1; // Keep global counter for uniqueness
      newTasks.push({
        id: `req-${requestId}-task-${nextTaskNum}`,
        title: taskDef.title,
        description: taskDef.description,
        done: false,
        approved: false,
        completedDetails: "",
      });
      nextTaskNum++;
    }

    req.tasks.push(...newTasks);
    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "tasks_added",
      message: `Added ${newTasks.length} new tasks to request.\n${progressTable}`,
      newTasks: newTasks.map((t) => {
        const taskMatch = t.id.match(/-task-(\d+)$/);
        const displayNumber = taskMatch ? parseInt(taskMatch[1]) : null;
        return {
        id: t.id,
          displayNumber,
        title: t.title,
        description: t.description,
        };
      }),
    };
  }

  public async updateTask(
    requestId: string,
    taskId: string,
    updates: { title?: string; description?: string }
  ) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    const task = req.tasks.find((t) => t.id === taskId);
    if (!task) return { status: "error", message: "Task not found" };
    if (task.done)
      return { status: "error", message: "Cannot update completed task" };

    if (updates.title) task.title = updates.title;
    if (updates.description) task.description = updates.description;

    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "task_updated",
      message: `Task ${taskId} has been updated.\n${progressTable}`,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
      },
    };
  }

  public async deleteTask(requestId: string, taskId: string) {
    await this.loadTasks();
    const req = this.data.requests.find((r) => r.requestId === requestId);
    if (!req) return { status: "error", message: "Request not found" };

    const taskIndex = req.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return { status: "error", message: "Task not found" };
    if (req.tasks[taskIndex].done)
      return { status: "error", message: "Cannot delete completed task" };

    req.tasks.splice(taskIndex, 1);
    await this.saveTasks();

    const progressTable = this.formatTaskProgressTable(requestId);
    return {
      status: "task_deleted",
      message: `Task ${taskId} has been deleted.\n${progressTable}`,
    };
  }

  public async clearAllTasks() {
    await this.loadTasks();
    
    const totalRequests = this.data.requests.length;
    const totalTasks = this.data.requests.reduce((sum, req) => sum + req.tasks.length, 0);
    
    // Reset everything
    this.data = { requests: [] };
    this.requestCounter = 0;
    this.taskCounter = 0;
    
    await this.saveTasks();
    
    return {
      status: "all_tasks_cleared",
      message: `Successfully cleared all tasks from the task manager. Removed ${totalRequests} requests and ${totalTasks} tasks.`,
      clearedRequests: totalRequests,
      clearedTasks: totalTasks,
    };
  }

  private calculateCompletionPercentage(subtasks: Subtask[]): number {
    if (!subtasks || subtasks.length === 0) return 0;
    const completedCount = subtasks.filter(st => st.status === "completed").length;
    return Math.round((completedCount / subtasks.length) * 100);
  }

  private generateSubtaskId(taskId: string): string {
    this.taskCounter += 1; // Keep global counter for uniqueness
    return `${taskId}-subtask-${this.taskCounter}`;
  }

  private validateStatusTransition(currentStatus: string, newStatus: string): boolean {
    const validTransitions: Record<string, string[]> = {
      'pending': ['in_progress', 'cancelled'],
      'in_progress': ['completed', 'pending', 'cancelled'],
      'completed': ['pending'], // Allow reopening completed tasks
      'cancelled': ['pending']  // Allow restarting cancelled tasks
    };
    return validTransitions[currentStatus]?.includes(newStatus) ?? false;
  }

  private validateUniqueContent(subtasks: Subtask[], newContent: string, excludeId?: string): boolean {
    return !subtasks.some(st =>
      st.content.toLowerCase() === newContent.toLowerCase() &&
      st.id !== excludeId
    );
  }

  private getValidTransitions(currentStatus: string): string[] {
    const validTransitions: Record<string, string[]> = {
      'pending': ['in_progress', 'cancelled'],
      'in_progress': ['completed', 'pending', 'cancelled'],
      'completed': ['pending'], // Allow reopening completed tasks
      'cancelled': ['pending']  // Allow restarting cancelled tasks
    };
    return validTransitions[currentStatus] || [];
  }

  private getSubtaskDisplayNumber(subtaskId: string, taskSubtasks: Subtask[]): number {
    // Sort subtasks by creation time and find the position of this subtask
    const sortedSubtasks = [...taskSubtasks].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const index = sortedSubtasks.findIndex(st => st.id === subtaskId);
    return index + 1; // Return 1-based position
  }

  private validateSubtaskData(subtask: Partial<Subtask>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!subtask.content) {
      errors.push("Subtask content is required");
    } else {
      if (subtask.content.length < 1) {
        errors.push("Subtask content cannot be empty");
      }
      if (subtask.content.length > 500) {
        errors.push("Subtask content cannot exceed 500 characters");
      }
      if (subtask.content.trim().length === 0) {
        errors.push("Subtask content cannot be only whitespace");
      }
    }

    if (subtask.status && !["pending", "in_progress", "completed", "cancelled"].includes(subtask.status)) {
      errors.push("Invalid status value");
    }

    return { valid: errors.length === 0, errors };
  }

  private async createBackup(): Promise<string> {
    const backupPath = `${TASK_FILE_PATH}.backup.${Date.now()}`;
    try {
      await fs.copyFile(TASK_FILE_PATH, backupPath);
      return backupPath;
    } catch (error) {
      // If backup fails, continue anyway (not critical)
      console.warn('Failed to create backup:', error);
      return '';
    }
  }

  private async rollbackToBackup(backupPath: string): Promise<void> {
    if (backupPath) {
      try {
        await fs.copyFile(backupPath, TASK_FILE_PATH);
        await fs.unlink(backupPath); // Clean up backup
      } catch (error) {
        console.error('Failed to rollback:', error);
      }
    }
  }

    public async manageSubtasks(params: {
    taskId: string;
    action: "create" | "update" | "complete" | "delete" | "break_down";
    subtasks?: Array<{
      id?: string;
      content: string;
      status?: "pending" | "in_progress" | "completed" | "cancelled";
    }>;
    subtaskId?: string;
    updates?: {
      content?: string;
      status?: "pending" | "in_progress" | "completed" | "cancelled";
    };
  }) {
    // Create backup for transaction safety
    const backupPath = await this.createBackup();

    try {
      await this.loadTasks();

      // Find the task across all requests
      let targetTask: Task | null = null;
      let requestIndex = -1;
      let taskIndex = -1;

      for (let i = 0; i < this.data.requests.length; i++) {
        const taskIdx = this.data.requests[i].tasks.findIndex(t => t.id === params.taskId);
        if (taskIdx !== -1) {
          targetTask = this.data.requests[i].tasks[taskIdx];
          requestIndex = i;
          taskIndex = taskIdx;
          break;
        }
      }

      if (!targetTask) {
            // Try to find the request that this task should belong to for better error message
      const requestIdMatch = params.taskId.match(/^req-(\d+)-/);
      const requestId = requestIdMatch ? `req-${requestIdMatch[1]}` : 'unknown';
      const taskMatch = params.taskId.match(/-task-(\d+)$/);
      const taskDisplayNumber = taskMatch ? parseInt(taskMatch[1]) : 'unknown';

      return {
        status: "error",
        message: `Task ${taskDisplayNumber} not found in request ${requestId}. Please check the task number and try again.`,
        code: "TASK_NOT_FOUND",
        providedTaskId: params.taskId
      };
      }

      switch (params.action) {
        case "create": {
          if (!params.subtasks || params.subtasks.length === 0) {
      return {
        status: "error",
              message: "No subtasks provided for creation",
              code: "MISSING_SUBTASKS"
            };
          }

          // Validate all subtasks before processing
          const validationErrors: string[] = [];
          const validatedSubtasks: Subtask[] = [];

          for (let i = 0; i < params.subtasks.length; i++) {
            const subtask = params.subtasks[i];
            const validation = this.validateSubtaskData(subtask);

            if (!validation.valid) {
              validationErrors.push(`Subtask ${i + 1}: ${validation.errors.join(', ')}`);
              continue;
            }

            // Check for duplicates
            const isUnique = this.validateUniqueContent(
              targetTask.subtasks || [],
              subtask.content!
            );

            if (!isUnique) {
              validationErrors.push(`Subtask ${i + 1}: Duplicate content "${subtask.content}"`);
              continue;
            }

                        validatedSubtasks.push({
              id: subtask.id || this.generateSubtaskId(params.taskId),
              content: subtask.content!,
              status: subtask.status || "pending",
      createdAt: new Date().toISOString(),
            });
          }

          if (validationErrors.length > 0) {
            return {
              status: "error",
              message: `Validation failed:\n${validationErrors.join('\n')}`,
              code: "VALIDATION_FAILED",
              errors: validationErrors
            };
          }

          if (!targetTask.subtasks) {
            targetTask.subtasks = [];
          }
          targetTask.subtasks.push(...validatedSubtasks);
          targetTask.completionPercentage = this.calculateCompletionPercentage(targetTask.subtasks);

          await this.saveTasks();
          // Add display numbers to the response
          const subtasksWithDisplayNumbers = validatedSubtasks.map((subtask, index) => ({
            ...subtask,
            displayNumber: (targetTask.subtasks?.length || 0) - validatedSubtasks.length + index + 1
          }));

          return {
            status: "subtasks_created",
            message: `Successfully added ${validatedSubtasks.length} subtasks to task "${targetTask.title}"`,
            subtasks: subtasksWithDisplayNumbers,
            completionPercentage: targetTask.completionPercentage,
            totalSubtasks: targetTask.subtasks.length
          };
        }

        case "update": {
          if (!params.subtaskId) {
            return {
              status: "error",
              message: "Subtask ID is required for update operation",
              code: "MISSING_SUBTASK_ID"
            };
          }

          if (!params.updates || (!params.updates.content && !params.updates.status)) {
            return {
              status: "error",
              message: "At least one update field (content or status) must be provided",
              code: "MISSING_UPDATES"
            };
          }

          if (!targetTask.subtasks) {
            return {
              status: "error",
              message: `Task "${targetTask.title}" has no subtasks to update`,
              code: "NO_SUBTASKS"
            };
          }

          const subtaskIndex = targetTask.subtasks.findIndex(st => st.id === params.subtaskId);
          if (subtaskIndex === -1) {
            return {
              status: "error",
              message: `Subtask "${params.subtaskId}" not found in task "${targetTask.title}". Please check the subtask ID and try again.`,
              code: "SUBTASK_NOT_FOUND",
              availableSubtasks: (targetTask.subtasks || []).map(st => ({
              id: st.id,
              displayNumber: this.getSubtaskDisplayNumber(st.id, targetTask.subtasks || []),
              content: st.content
            }))
            };
          }

          const subtask = targetTask.subtasks[subtaskIndex];

          // Validate updates
          const validationErrors: string[] = [];

          if (params.updates.content) {
            const contentValidation = this.validateSubtaskData({ content: params.updates.content });
            if (!contentValidation.valid) {
              validationErrors.push(...contentValidation.errors);
            } else {
              // Check for duplicates (excluding current subtask)
              const isUnique = this.validateUniqueContent(
                targetTask.subtasks,
                params.updates.content,
                params.subtaskId
              );
              if (!isUnique) {
                validationErrors.push(`Content "${params.updates.content}" already exists in another subtask`);
              }
            }
          }

          if (params.updates.status) {
            if (!this.validateStatusTransition(subtask.status, params.updates.status)) {
              validationErrors.push(`Cannot change status from "${subtask.status}" to "${params.updates.status}". Valid transitions: ${this.getValidTransitions(subtask.status).join(', ')}`);
            }
          }

          if (validationErrors.length > 0) {
            return {
              status: "error",
              message: `Update validation failed:\n${validationErrors.join('\n')}`,
              code: "UPDATE_VALIDATION_FAILED",
              errors: validationErrors
            };
          }

          // Apply updates
          if (params.updates.content) {
            subtask.content = params.updates.content;
          }

          if (params.updates.status) {
            const oldStatus = subtask.status;
            subtask.status = params.updates.status;

            if (params.updates.status === "completed" && oldStatus !== "completed") {
              subtask.completedAt = new Date().toISOString();
            } else if (params.updates.status !== "completed" && oldStatus === "completed") {
              subtask.completedAt = undefined;
            }
          }

          targetTask.completionPercentage = this.calculateCompletionPercentage(targetTask.subtasks);
          await this.saveTasks();

          return {
            status: "subtask_updated",
            message: `Successfully updated subtask ${this.getSubtaskDisplayNumber(subtask.id, targetTask.subtasks!)} "${subtask.content}"`,
            subtask: {
              id: subtask.id,
              displayNumber: this.getSubtaskDisplayNumber(subtask.id, targetTask.subtasks!),
              content: subtask.content,
              status: subtask.status,
              completedAt: subtask.completedAt
            },
            completionPercentage: targetTask.completionPercentage,
            taskTitle: targetTask.title
          };
        }

        case "complete": {
          if (!params.subtaskId) {
            return {
              status: "error",
              message: "Subtask ID is required to complete a subtask",
              code: "MISSING_SUBTASK_ID"
            };
          }

          if (!targetTask.subtasks) {
            return {
              status: "error",
              message: `Task "${targetTask.title}" has no subtasks to complete`,
              code: "NO_SUBTASKS"
            };
          }

          const subtaskIndex = targetTask.subtasks.findIndex(st => st.id === params.subtaskId);
          if (subtaskIndex === -1) {
            return {
              status: "error",
              message: `Subtask "${params.subtaskId}" not found in task "${targetTask.title}". Please check the subtask ID and try again.`,
              code: "SUBTASK_NOT_FOUND",
              availableSubtasks: (targetTask.subtasks || []).map(st => ({
              id: st.id,
              displayNumber: this.getSubtaskDisplayNumber(st.id, targetTask.subtasks || []),
              content: st.content
            }))
            };
          }

          const subtask = targetTask.subtasks[subtaskIndex];

          if (subtask.status === "completed") {
            return {
              status: "error",
              message: `Subtask "${subtask.content}" is already completed`,
              code: "ALREADY_COMPLETED"
            };
          }

          // Validate status transition
          if (!this.validateStatusTransition(subtask.status, "completed")) {
            return {
              status: "error",
              message: `Cannot complete subtask "${subtask.content}" with status "${subtask.status}". Valid transitions: ${this.getValidTransitions(subtask.status).join(', ')}`,
              code: "INVALID_TRANSITION"
            };
          }

          subtask.status = "completed";
          subtask.completedAt = new Date().toISOString();
          targetTask.completionPercentage = this.calculateCompletionPercentage(targetTask.subtasks);

          await this.saveTasks();
          return {
            status: "subtask_completed",
            message: `Successfully marked subtask ${this.getSubtaskDisplayNumber(subtask.id, targetTask.subtasks!)} "${subtask.content}" as completed`,
            subtask: {
              id: subtask.id,
              displayNumber: this.getSubtaskDisplayNumber(subtask.id, targetTask.subtasks!),
              content: subtask.content,
              status: subtask.status,
              completedAt: subtask.completedAt
            },
            completionPercentage: targetTask.completionPercentage,
            taskTitle: targetTask.title,
            remainingSubtasks: targetTask.subtasks.filter(st => st.status !== "completed").length
          };
        }

        case "delete": {
          if (!params.subtaskId) {
      return {
              status: "error",
              message: "Subtask ID is required for deletion",
              code: "MISSING_SUBTASK_ID"
            };
          }

          if (!targetTask.subtasks) {
            return {
              status: "error",
              message: `Task "${targetTask.title}" has no subtasks to delete`,
              code: "NO_SUBTASKS"
            };
          }

          const subtaskIndex = targetTask.subtasks.findIndex(st => st.id === params.subtaskId);
          if (subtaskIndex === -1) {
    return {
              status: "error",
              message: `Subtask "${params.subtaskId}" not found in task "${targetTask.title}". Please check the subtask ID and try again.`,
              code: "SUBTASK_NOT_FOUND",
              availableSubtasks: (targetTask.subtasks || []).map(st => ({
              id: st.id,
              displayNumber: this.getSubtaskDisplayNumber(st.id, targetTask.subtasks || []),
              content: st.content
            }))
            };
          }

          const deletedSubtask = targetTask.subtasks[subtaskIndex];

          // Confirm deletion
          if (deletedSubtask.status === "completed") {
            return {
              status: "error",
              message: `Cannot delete completed subtask "${deletedSubtask.content}". Only pending, in_progress, or cancelled subtasks can be deleted.`,
              code: "CANNOT_DELETE_COMPLETED"
            };
          }

          targetTask.subtasks.splice(subtaskIndex, 1);
          targetTask.completionPercentage = this.calculateCompletionPercentage(targetTask.subtasks);

          await this.saveTasks();
          const originalDisplayNumber = this.getSubtaskDisplayNumber(deletedSubtask.id, targetTask.subtasks.concat(deletedSubtask));

          return {
            status: "subtask_deleted",
            message: `Successfully deleted subtask ${originalDisplayNumber} "${deletedSubtask.content}" from task "${targetTask.title}"`,
            deletedSubtask: {
              id: deletedSubtask.id,
              displayNumber: originalDisplayNumber,
              content: deletedSubtask.content,
              status: deletedSubtask.status
            },
            completionPercentage: targetTask.completionPercentage,
            remainingSubtasks: targetTask.subtasks.length
          };
        }

        case "break_down": {
          if (!params.subtasks || params.subtasks.length === 0) {
            return {
              status: "error",
              message: "Subtasks are required for break_down action",
              code: "MISSING_SUBTASKS"
            };
          }

          if (params.subtasks.length > 50) {
            return {
              status: "error",
              message: `Too many subtasks (${params.subtasks.length}). Maximum allowed is 50.`,
              code: "TOO_MANY_SUBTASKS"
            };
          }

          // Validate all subtasks before processing
          const validationErrors: string[] = [];
          const validatedSubtasks: Subtask[] = [];

          for (let i = 0; i < params.subtasks.length; i++) {
            const subtask = params.subtasks[i];
            const validation = this.validateSubtaskData(subtask);

            if (!validation.valid) {
              validationErrors.push(`Subtask ${i + 1}: ${validation.errors.join(', ')}`);
              continue;
            }

            validatedSubtasks.push({
              id: subtask.id || this.generateSubtaskId(params.taskId),
              content: subtask.content!,
              status: subtask.status || "pending",
              createdAt: new Date().toISOString(),
            });
          }

          if (validationErrors.length > 0) {
            return {
              status: "error",
              message: `Break-down validation failed:\n${validationErrors.join('\n')}`,
              code: "VALIDATION_FAILED",
              errors: validationErrors
            };
          }

          // Check for duplicates within the new subtasks
          const duplicateContents = validatedSubtasks.filter((st, index) =>
            validatedSubtasks.findIndex(other => other.content.toLowerCase() === st.content.toLowerCase()) !== index
          );

          if (duplicateContents.length > 0) {
            return {
              status: "error",
              message: `Duplicate subtask content found: "${duplicateContents[0].content}". All subtasks must have unique content.`,
              code: "DUPLICATE_CONTENT"
            };
          }

          targetTask.subtasks = validatedSubtasks;
          targetTask.completionPercentage = this.calculateCompletionPercentage(validatedSubtasks);

          await this.saveTasks();
          // Add display numbers to the response
          const subtasksWithDisplayNumbers = validatedSubtasks.map((subtask, index) => ({
            ...subtask,
            displayNumber: index + 1
          }));

          return {
            status: "task_broken_down",
            message: `Successfully converted task "${targetTask.title}" into ${validatedSubtasks.length} subtasks`,
            subtasks: subtasksWithDisplayNumbers,
            completionPercentage: targetTask.completionPercentage,
            taskTitle: targetTask.title
          };
        }

      default:
        return {
          status: "error",
          message: `Unknown action "${params.action}". Valid actions are: create, update, complete, delete, break_down`,
          code: "UNKNOWN_ACTION",
          validActions: ["create", "update", "complete", "delete", "break_down"]
        };
    }
    } catch (error) {
      // Rollback on error
      console.error('Error in manageSubtasks:', error);
      await this.rollbackToBackup(backupPath);

      return {
        status: "error",
        message: `An unexpected error occurred while managing subtasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: "INTERNAL_ERROR",
        originalError: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

const server = new Server(
  {
    name: "task-manager-server",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const taskManagerServer = new TaskManagerServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    REQUEST_PLANNING_TOOL,
    GET_NEXT_TASK_TOOL,
    MARK_TASK_DONE_TOOL,
    APPROVE_TASK_COMPLETION_TOOL,
    APPROVE_REQUEST_COMPLETION_TOOL,
    OPEN_TASK_DETAILS_TOOL,
    LIST_REQUESTS_TOOL,
    ADD_TASKS_TO_REQUEST_TOOL,
    UPDATE_TASK_TOOL,
    DELETE_TASK_TOOL,
    CLEAR_ALL_TASKS_TOOL,
    MANAGE_SUBTASKS_TOOL,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "request_planning": {
        const parsed = RequestPlanningSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { originalRequest, tasks, splitDetails } = parsed.data;
        const result = await taskManagerServer.requestPlanning(
          originalRequest,
          tasks,
          splitDetails
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_next_task": {
        const parsed = GetNextTaskSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await taskManagerServer.getNextTask(
          parsed.data.requestId
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mark_task_done": {
        const parsed = MarkTaskDoneSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId, taskId, completedDetails } = parsed.data;
        const result = await taskManagerServer.markTaskDone(
          requestId,
          taskId,
          completedDetails
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "approve_task_completion": {
        const parsed = ApproveTaskCompletionSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId, taskId } = parsed.data;
        const result = await taskManagerServer.approveTaskCompletion(
          requestId,
          taskId
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "approve_request_completion": {
        const parsed = ApproveRequestCompletionSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId } = parsed.data;
        const result =
          await taskManagerServer.approveRequestCompletion(requestId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "open_task_details": {
        const parsed = OpenTaskDetailsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { taskId } = parsed.data;
        const result = await taskManagerServer.openTaskDetails(taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "list_requests": {
        const parsed = ListRequestsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await taskManagerServer.listRequests();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "add_tasks_to_request": {
        const parsed = AddTasksToRequestSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId, tasks } = parsed.data;
        const result = await taskManagerServer.addTasksToRequest(
          requestId,
          tasks
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "update_task": {
        const parsed = UpdateTaskSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId, taskId, title, description } = parsed.data;
        const result = await taskManagerServer.updateTask(requestId, taskId, {
          title,
          description,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "delete_task": {
        const parsed = DeleteTaskSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const { requestId, taskId } = parsed.data;
        const result = await taskManagerServer.deleteTask(requestId, taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "clear_all_tasks": {
        const parsed = ClearAllTasksSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments: ${parsed.error}`);
        }
        const result = await taskManagerServer.clearAllTasks();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "manage_subtasks": {
        const parsed = ManageSubtasksSchema.safeParse(args);
        if (!parsed.success) {
          const errorMessages = parsed.error.issues.map(issue => {
            const fieldPath = issue.path.join('.');
            return `${fieldPath}: ${issue.message}`;
          });

        return {
            content: [{
              type: "text",
              text: JSON.stringify({
                status: "error",
                message: `Invalid manage_subtasks arguments:\n${errorMessages.join('\n')}`,
                code: "SCHEMA_VALIDATION_FAILED",
                validationErrors: errorMessages
              }, null, 2)
            }],
            isError: true,
          };
        }
        const result = await taskManagerServer.manageSubtasks(parsed.data);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Task Manager MCP Server running. Saving tasks at: ${TASK_FILE_PATH}`
  );
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
