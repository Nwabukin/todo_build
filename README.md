# 🚀 Advanced MCP TaskManager

**A production-ready Model Context Protocol server for sophisticated task management with subtask support, enhanced validation, and hybrid numbering system.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?logo=node.js&logoColor=white)](https://nodejs.org)
[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-181717?logo=github)](https://github.com/Nwabukin/todo_build)
[![GitHub Stars](https://img.shields.io/github/stars/Nwabukin/todo_build)](https://github.com/Nwabukin/todo_build/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/Nwabukin/todo_build)](https://github.com/Nwabukin/todo_build/forks)
[![GitHub Issues](https://img.shields.io/github/issues/Nwabukin/todo_build)](https://github.com/Nwabukin/todo_build/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/Nwabukin/todo_build)](https://github.com/Nwabukin/todo_build/pulls)

**Repository:** [https://github.com/Nwabukin/todo_build](https://github.com/Nwabukin/todo_build)  
**Built by:** Nwabueze Chigozirim Victor  
**Version:** 2.0.0  
**License:** MIT

## ✨ Features

### 🎯 Core Capabilities
- **12 Powerful Tools** for comprehensive task management
- **Hybrid Numbering System** - User-friendly display with technical integrity
- **Advanced Validation** - Enterprise-grade input validation and error handling
- **Subtask Support** - Break down complex tasks into manageable pieces
- **Progress Tracking** - Visual completion percentages and status indicators
- **Transaction Safety** - Backup/rollback for data integrity

### 🔧 Technical Excellence
- **TypeScript** - Full type safety and modern development experience
- **Zod Validation** - Schema-based validation with detailed error messages
- **Error Handling** - Comprehensive error codes and user-friendly messages
- **Data Persistence** - JSON-based storage with crash recovery
- **Modular Architecture** - Clean, maintainable, and extensible codebase

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Tool Overview](#tool-overview)
- [Subtask Management](#subtask-management)
- [Hybrid Numbering System](#hybrid-numbering-system)
- [Validation System](#validation-system)
- [Configuration](#configuration)
- [Development](#development)
- [API Reference](#api-reference)
- [Examples](#examples)

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** (install via `brew install node` or from [nodejs.org](https://nodejs.org))
- **Claude Desktop** (install from [claude.ai/desktop](https://claude.ai/desktop))
- **npm** or **yarn** package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/Nwabukin/todo_build.git
cd todo_build

# Install dependencies
npm install

# Build the project
npm run build
```

### Configuration

#### For Claude Desktop

1. **Locate Configuration File:**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Add MCP Server Configuration:**

```json
{
  "mcpServers": {
    "taskmanager": {
      "command": "node",
      "args": ["/path/to/todo_build/dist/index.js"]
    }
  }
}
```

3. **Restart Claude Desktop** to load the new configuration.

### Verify Installation

After restarting Claude Desktop, you should see the task management tools available in the chat interface.

## 🛠️ Tool Overview

This MCP server provides **12 comprehensive tools** for task management:

### Core Task Management
1. **`request_planning`** - Create new requests with associated tasks
2. **`get_next_task`** - Retrieve the next pending task with progress display
3. **`mark_task_done`** - Mark tasks as completed (with subtask validation)
4. **`approve_task_completion`** - Approve completed tasks
5. **`approve_request_completion`** - Final approval for entire requests

### Information & Organization
6. **`open_task_details`** - Get detailed information about specific tasks
7. **`list_requests`** - List all requests with summary statistics
8. **`add_tasks_to_request`** - Add additional tasks to existing requests
9. **`update_task`** - Modify task titles and descriptions
10. **`delete_task`** - Remove tasks from requests

### Advanced Subtask Management
11. **`manage_subtasks`** - Complete subtask management system (create, update, complete, delete, break_down)
12. **`clear_all_tasks`** - System maintenance and cleanup

## 🎯 Subtask Management

The **`manage_subtasks`** tool provides a complete subtask management system with 5 powerful actions:

### Available Actions

#### **`create`** - Add subtasks to a task
```json
{
  "taskId": "req-1-task-1",
  "action": "create",
  "subtasks": [
    {"content": "Design API endpoints", "status": "pending"},
    {"content": "Implement authentication", "status": "pending"}
  ]
}
```

#### **`update`** - Modify subtask content or status
```json
{
  "taskId": "req-1-task-1",
  "action": "update",
  "subtaskId": "req-1-task-1-subtask-123",
  "updates": {
    "content": "Design RESTful API endpoints",
    "status": "in_progress"
  }
}
```

#### **`complete`** - Mark subtasks as completed
```json
{
  "taskId": "req-1-task-1",
  "action": "complete",
  "subtaskId": "req-1-task-1-subtask-123"
}
```

#### **`delete`** - Remove subtasks (only if not completed)
```json
{
  "taskId": "req-1-task-1",
  "action": "delete",
  "subtaskId": "req-1-task-1-subtask-123"
}
```

#### **`break_down`** - Convert simple tasks into structured subtasks
```json
{
  "taskId": "req-1-task-1",
  "action": "break_down",
  "subtasks": [
    {"content": "Research requirements", "status": "pending"},
    {"content": "Create wireframes", "status": "pending"},
    {"content": "Develop prototype", "status": "pending"}
  ]
}
```

## 🔢 Hybrid Numbering System

This server implements a **unique hybrid numbering system** that provides both user-friendly display and technical integrity:

### How It Works

#### **Internal IDs (Technical Layer):**
```
Request IDs: req-1, req-2, req-3
Task IDs: req-1-task-1, req-1-task-2, req-2-task-1
Subtask IDs: req-1-task-1-subtask-123, req-1-task-1-subtask-124
```

#### **Display Numbers (User Layer):**
```
Tasks: Task 1, Task 2, Task 3 (within each request)
Subtasks: Subtask 1, Subtask 2, Subtask 3 (within each task)
```

### Benefits

- ✅ **User-Friendly**: Intuitive sequential numbering
- ✅ **Context-Aware**: Numbers reset within each request/task
- ✅ **Globally Unique**: Internal IDs prevent collisions
- ✅ **Future-Proof**: Scales with any number of requests/tasks

## 🛡️ Validation System

### Enterprise-Grade Validation

#### **Schema Validation (Zod)**
- Content length limits (1-500 characters)
- Required field validation
- Type checking and enum validation
- Action-specific parameter validation

#### **Business Logic Validation**
- Status transition validation
- Duplicate content prevention
- Size limits (max 50 subtasks per task)
- Existence checks for tasks and subtasks

#### **Transaction Safety**
- Automatic backups before operations
- Rollback functionality on errors
- Atomic operations (all-or-nothing)

### Error Handling

#### **Structured Error Responses**
```json
{
  "status": "error",
  "message": "Validation failed: Subtask content cannot be empty",
  "code": "VALIDATION_FAILED",
  "errors": [
    "Subtask 1: Content cannot be empty",
    "Subtask 2: Content cannot be only whitespace"
  ]
}
```

#### **Error Codes**
- `VALIDATION_FAILED` - Input validation errors
- `TASK_NOT_FOUND` - Task doesn't exist
- `SUBTASK_NOT_FOUND` - Subtask doesn't exist
- `INVALID_TRANSITION` - Invalid status change
- `MISSING_SUBTASKS` - No subtasks provided
- `DUPLICATE_CONTENT` - Duplicate subtask content
- `INTERNAL_ERROR` - System errors with rollback

## 📖 API Reference

### Core Endpoints

#### `request_planning`
**Create a new request with tasks**

**Parameters:**
- `originalRequest` (string, required) - Description of the request
- `tasks` (array, required) - Array of task objects with `title` and `description`
- `splitDetails` (string, optional) - Additional details about the request

**Response:**
```json
{
  "status": "planned",
  "requestId": "req-1",
  "totalTasks": 3,
  "tasks": [
    {
      "id": "req-1-task-1",
      "displayNumber": 1,
      "title": "Design System",
      "description": "Create design system components"
    }
  ]
}
```

#### `manage_subtasks`
**Manage subtasks for a task**

**Parameters:**
- `taskId` (string, required) - ID of the parent task
- `action` (string, required) - Action to perform: "create", "update", "complete", "delete", "break_down"
- `subtasks` (array, optional) - Array of subtask objects (for create/break_down)
- `subtaskId` (string, optional) - ID of subtask to modify (for update/complete/delete)
- `updates` (object, optional) - Updates to apply (for update)

**Response:**
```json
{
  "status": "subtasks_created",
  "message": "Successfully added 3 subtasks to task 'Build API'",
  "subtasks": [
    {
      "id": "req-1-task-1-subtask-1",
      "displayNumber": 1,
      "content": "Design endpoints",
      "status": "pending",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "completionPercentage": 0
}
```

## 💡 Examples

### Complete Workflow Example

#### 1. Create a Request
```json
{
  "tool": "request_planning",
  "arguments": {
    "originalRequest": "Build a mobile app for task management",
    "tasks": [
      {
        "title": "Build Mobile App",
        "description": "Create a complete mobile application with React Native"
      }
    ]
  }
}
```

#### 2. Break Down into Subtasks
```json
{
  "tool": "manage_subtasks",
  "arguments": {
    "taskId": "req-1-task-1",
    "action": "break_down",
    "subtasks": [
      {"content": "Set up React Native project", "status": "pending"},
      {"content": "Design app architecture", "status": "pending"},
      {"content": "Implement core features", "status": "pending"},
      {"content": "Add testing framework", "status": "pending"}
    ]
  }
}
```

#### 3. Work Through Subtasks
```json
{
  "tool": "manage_subtasks",
  "arguments": {
    "taskId": "req-1-task-1",
    "action": "complete",
    "subtaskId": "req-1-task-1-subtask-1"
  }
}
```

#### 4. Check Progress
```json
{
  "tool": "get_next_task",
  "arguments": {
    "requestId": "req-1"
  }
}
```

**Response:**
```json
{
  "status": "next_task",
  "task": {
    "id": "req-1-task-1",
    "displayNumber": 1,
    "title": "Build Mobile App",
    "description": "Create a complete mobile application with React Native"
  },
  "message": "Next task (1) is ready. Task approval will be required after completion.\n\nProgress Status:\n| Task # | Title | Description | Status | Progress | Approval |\n|--------|--------|------|------|------|----------|----------|\n| Task 1 | Build Mobile App | Create a complete mobile application... | 🔄 In Progress | 25% | ⏳ Pending |\n| └─ Subtask 1 | Set up React Native project | ✅ | completed | |\n| └─ Subtask 2 | Design app architecture | 🔄 | in_progress | |\n| └─ Subtask 3 | Implement core features | ⏳ | pending | |\n| └─ Subtask 4 | Add testing framework | ⏳ | pending | |"
}
```

## 🔧 Development

### Prerequisites
- **Node.js 18+**
- **TypeScript 5.3+**
- **npm** or **yarn**

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Nwabukin/todo_build.git
cd todo_build

# Install dependencies
npm install

# Start development mode with auto-rebuild
npm run watch

# In another terminal, run the server
node dist/index.js
```

### Project Structure

```
todo_build/
├── index.ts              # Main MCP server implementation
├── dist/                 # Compiled JavaScript output
├── package.json          # Project metadata and dependencies
├── tsconfig.json         # TypeScript configuration
├── biome.json            # Code formatting configuration
├── README.md             # This documentation
├── LICENSE               # MIT license
├── .gitignore            # Git ignore rules
└── test_subtasks.js      # Demonstration script
```

### Key Files

- **`index.ts`** - Complete MCP server with all 12 tools
- **`package.json`** - Project metadata and scripts
- **`tsconfig.json`** - TypeScript compiler options
- **`test_subtasks.js`** - Demonstration script for testing

## 🤝 Contributing

This project is maintained by **Nwabueze Chigozirim Victor**. Contributions are welcome!

### Ways to Contribute

- 🐛 **Bug Reports** - [Report issues](https://github.com/Nwabukin/todo_build/issues) via GitHub Issues
- 💡 **Feature Requests** - [Suggest new functionality](https://github.com/Nwabukin/todo_build/issues/new?template=feature_request.md)
- 🔧 **Code Contributions** - Submit pull requests to [https://github.com/Nwabukin/todo_build/pulls](https://github.com/Nwabukin/todo_build/pulls)
- 📖 **Documentation** - Improve documentation and examples
- ⭐ **Star the repository** - Show your support!

### Development Guidelines

1. **Fork the repository** - Create your own fork of [todo_build](https://github.com/Nwabukin/todo_build)
2. **Create a feature branch** - `git checkout -b feature/amazing-feature`
3. **Make your changes** following our guidelines
4. **Test thoroughly** - Ensure all functionality works
5. **Submit a pull request** - We'll review and merge!

#### Code Standards:
1. **TypeScript** - All code must be written in TypeScript
2. **Validation** - Add proper validation for new features
3. **Error Handling** - Use structured error responses
4. **Documentation** - Update README for new features
5. **Testing** - Test new functionality thoroughly

#### Commit Message Format:
```
feat: add new subtask filtering functionality
fix: resolve validation error for empty task content
docs: update API reference for manage_subtasks tool
refactor: optimize task completion percentage calculation
```

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Original Creator**: kazuph for the initial MCP TaskManager concept
- **Enhanced By**: Nwabueze Chigozirim Victor with advanced features
- **Community**: Thanks to the MCP and Claude Desktop communities

## 📞 Support & Community

For questions, issues, or contributions:

- 📧 **Email**: Contact Nwabueze Chigozirim Victor
- 🐛 **Issues**: [GitHub Issues](https://github.com/Nwabukin/todo_build/issues) - Report bugs and request features
- 💬 **Discussions**: [GitHub Discussions](https://github.com/Nwabukin/todo_build/discussions) - Ask questions and share ideas
- 🔀 **Pull Requests**: [GitHub Pull Requests](https://github.com/Nwabukin/todo_build/pulls) - Submit code contributions
- 📖 **Documentation**: This README and inline code comments
- 🌟 **Stars**: Show your support by starring the [repository](https://github.com/Nwabukin/todo_build)!

### 📊 Repository Stats
- **Stars**: [![GitHub Stars](https://img.shields.io/github/stars/Nwabukin/todo_build)](https://github.com/Nwabukin/todo_build/stargazers)
- **Forks**: [![GitHub Forks](https://img.shields.io/github/forks/Nwabukin/todo_build)](https://github.com/Nwabukin/todo_build/forks)
- **Issues**: [![GitHub Issues](https://img.shields.io/github/issues/Nwabukin/todo_build)](https://github.com/Nwabukin/todo_build/issues)
- **Pull Requests**: [![GitHub Pull Requests](https://img.shields.io/github/issues-pr/Nwabukin/todo_build)](https://github.com/Nwabukin/todo_build/pulls)

### 🔗 Quick Links
- **🏠 Homepage**: [https://github.com/Nwabukin/todo_build](https://github.com/Nwabukin/todo_build)
- **📋 Issues**: [https://github.com/Nwabukin/todo_build/issues](https://github.com/Nwabukin/todo_build/issues)
- **🔀 Pull Requests**: [https://github.com/Nwabukin/todo_build/pulls](https://github.com/Nwabukin/todo_build/pulls)
- **💬 Discussions**: [https://github.com/Nwabukin/todo_build/discussions](https://github.com/Nwabukin/todo_build/discussions)
- **📚 Wiki**: [https://github.com/Nwabukin/todo_build/wiki](https://github.com/Nwabukin/todo_build/wiki) (if available)
- **📊 Insights**: [https://github.com/Nwabukin/todo_build/pulse](https://github.com/Nwabukin/todo_build/pulse)

### 🤝 Contributing
This project welcomes contributions! Please see our [Contributing Guidelines](#-contributing) for details on how to get started.

---

## 🙏 Acknowledgments

- **Original Creator**: kazuph for the initial MCP TaskManager concept
- **Enhanced By**: Nwabueze Chigozirim Victor with advanced features and production-ready implementation
- **Community**: Thanks to the MCP and Claude Desktop communities for their inspiration and support
- **Contributors**: All future contributors who help improve this project

---

**Built with ❤️ by Nwabueze Chigozirim Victor**

*Transforming task management through intelligent automation and user-centric design.*

**⭐ Don't forget to star the repository if you find it useful!**
**[https://github.com/Nwabukin/todo_build](https://github.com/Nwabukin/todo_build)**
