#!/usr/bin/env node

const { spawn } = require('child_process');

// Start the MCP server
const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: process.cwd()
});

let messageId = 1;

// Function to send MCP message
function sendMessage(method, params = {}) {
  const message = {
    jsonrpc: "2.0",
    id: messageId++,
    method,
    params
  };

  console.log('\n📤 Sending:', JSON.stringify(message, null, 2));
  server.stdin.write(JSON.stringify(message) + '\n');
}

// Function to handle responses
function handleResponse(data) {
  const response = JSON.parse(data.toString());
  console.log('\n📥 Response:', JSON.stringify(response, null, 2));

  // Parse the content if it's a tool response
  if (response.result && response.result.content && response.result.content[0]) {
    try {
      const content = JSON.parse(response.result.content[0].text);
      console.log('\n🎯 Parsed Content:', JSON.stringify(content, null, 2));
    } catch (e) {
      console.log('\n📝 Raw Content:', response.result.content[0].text);
    }
  }
}

// Listen for server responses
server.stdout.on('data', handleResponse);
server.stderr.on('data', (data) => {
  console.log('📋 Server Log:', data.toString().trim());
});

// Wait a moment for server to start
setTimeout(() => {
  console.log('\n🚀 Starting MCP Subtask Demonstration...\n');

  // Step 1: Create a request with a complex task
  sendMessage('tools/call', {
    name: 'request_planning',
    arguments: {
      originalRequest: 'Build a mobile app for task management',
      tasks: [{
        title: 'Build Mobile App',
        description: 'Create a complete mobile application for task management with user authentication and cloud sync'
      }]
    }
  });

  // Step 2: After a delay, break down the task
  setTimeout(() => {
    sendMessage('tools/call', {
      name: 'manage_subtasks',
      arguments: {
        taskId: 'task-1',
        action: 'break_down',
        subtasks: [
          {
            content: 'Design app architecture and data models',
            status: 'pending'
          },
          {
            content: 'Implement user authentication system',
            status: 'pending'
          },
          {
            content: 'Create task CRUD operations',
            status: 'pending'
          },
          {
            content: 'Build user interface components',
            status: 'pending'
          }
        ]
      }
    });

    // Step 3: Check progress
    setTimeout(() => {
      sendMessage('tools/call', {
        name: 'get_next_task',
        arguments: {
          requestId: 'req-1'
        }
      });

      // Step 4: Complete a subtask
      setTimeout(() => {
        sendMessage('tools/call', {
          name: 'manage_subtasks',
          arguments: {
            taskId: 'task-1',
            action: 'complete',
            subtaskId: 'subtask-1'
          }
        });

        // Step 5: Check updated progress
        setTimeout(() => {
          sendMessage('tools/call', {
            name: 'get_next_task',
            arguments: {
              requestId: 'req-1'
            }
          });

          // Exit after demonstration
          setTimeout(() => {
            console.log('\n🎉 Demonstration complete!');
            server.kill();
            process.exit(0);
          }, 2000);

        }, 1500);

      }, 1500);

    }, 1500);

  }, 1500);

}, 2000);

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

server.on('close', (code) => {
  console.log(`\nServer exited with code ${code}`);
});
