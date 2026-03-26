-- Debugging (DAP)
return {
  {
    "mfussenegger/nvim-dap",
    dependencies = {
      "rcarriga/nvim-dap-ui",
      "nvim-neotest/nvim-nio",
    },
    keys = {
      { "<leader>db", function() require("dap").toggle_breakpoint() end, desc = "Toggle breakpoint" },
      { "<leader>dc", desc = "Debug continue / launch" },
      { "<leader>do", function() require("dap").step_over() end, desc = "Debug step over" },
      { "<leader>di", function() require("dap").step_into() end, desc = "Debug step into" },
      { "<leader>dO", function() require("dap").step_out() end, desc = "Debug step out" },
      { "<leader>dt", function() require("dap").terminate() end, desc = "Debug terminate" },
      { "<leader>du", function() require("dapui").toggle() end, desc = "Debug UI toggle" },
    },
    config = function()
      local dap = require("dap")
      local dapui = require("dapui")

      vim.fn.sign_define("DapBreakpoint", { text = "●", texthl = "DiagnosticError" })
      vim.fn.sign_define("DapBreakpointCondition", { text = "●", texthl = "DiagnosticWarn" })
      vim.fn.sign_define("DapStopped", { text = "▶", texthl = "DiagnosticInfo", linehl = "CursorLine" })

      dapui.setup()

      -- nvim-dap doesn't support ${lineNumber}, so resolve it before launch
      local orig_run = dap.run
      dap.run = function(config, opts)
        config = vim.deepcopy(config)
        local function resolve(val)
          if type(val) == "string" then
            return val:gsub("%${lineNumber}", tostring(vim.fn.line(".")))
          elseif type(val) == "table" then
            local t = {}
            for k, v in pairs(val) do
              t[k] = resolve(v)
            end
            return t
          end
          return val
        end
        config = resolve(config)
        return orig_run(config, opts)
      end

      -- Auto open/close UI
      dap.listeners.after.event_initialized["dapui_config"] = function()
        dapui.open()
      end
      dap.listeners.before.event_terminated["dapui_config"] = function()
        dapui.close()
      end
      dap.listeners.before.event_exited["dapui_config"] = function()
        dapui.close()
      end

      -- JS/TS adapter via vscode-js-debug
      local js_debug_path = vim.fn.stdpath("data") .. "/lazy/vscode-js-debug"
      local Session = require("dap.session")

      -- Handler for js-debug child processes (vitest forks, etc.)
      local function handle_child_session(parent, request)
        local body = request.arguments
        local child_config = body.config or {}
        local child_port = tonumber(child_config.__jsDebugChildServer)
        if not child_port then
          return
        end

        local child_adapter = {
          type = "server",
          host = "127.0.0.1",
          port = child_port,
          reverse_request_handlers = {
            attachedChildSession = handle_child_session,
          },
        }

        local session
        session = Session.connect(child_adapter, child_config, {}, function(err)
          if err then
            vim.notify("Child debug session failed: " .. err, vim.log.levels.WARN)
          elseif session then
            session.parent = parent
            parent.children[session.id] = session
            session.on_close["dap.child"] = function(s)
              if s.parent then
                s.parent.children[s.id] = nil
                s.parent = nil
              end
            end
            session:initialize(child_config)
            parent:response(request, { success = true })
          end
        end)
      end

      for _, adapter in ipairs({ "pwa-node", "pwa-chrome" }) do
        dap.adapters[adapter] = {
          type = "server",
          host = "localhost",
          port = "${port}",
          executable = {
            command = "node",
            args = { js_debug_path .. "/out/src/vsDebugServer.js", "${port}" },
          },
          reverse_request_handlers = {
            attachedChildSession = handle_child_session,
          },
        }
      end

      -- Also register non-pwa types so launch.json "type": "node" works
      dap.adapters["node"] = function(cb, config)
        config.type = "pwa-node"
        local adapter = dap.adapters["pwa-node"]
        if type(adapter) == "function" then
          adapter(cb, config)
        else
          cb(adapter)
        end
      end

      -- Load .vscode/launch.json if present (picks up vitest configs etc.)
      -- <leader>dc loads launch.json then continues
      local launch_json_loaded = false
      vim.keymap.set("n", "<leader>dc", function()
        if not launch_json_loaded and vim.fn.filereadable(".vscode/launch.json") == 1 then
          require("dap.ext.vscode").load_launchjs(nil, {
            ["pwa-node"] = { "javascript", "typescript", "javascriptreact", "typescriptreact" },
            ["node"] = { "javascript", "typescript", "javascriptreact", "typescriptreact" },
          })
          launch_json_loaded = true
        end
        dap.continue()
      end, { desc = "Debug continue / launch" })

      -- Fallback configurations (used when no launch.json)
      for _, language in ipairs({ "typescript", "javascript", "typescriptreact", "javascriptreact" }) do
        dap.configurations[language] = {
          {
            type = "pwa-node",
            request = "launch",
            name = "Launch file",
            program = "${file}",
            cwd = "${workspaceFolder}",
          },
          {
            type = "pwa-node",
            request = "attach",
            name = "Attach to process",
            processId = require("dap.utils").pick_process,
            cwd = "${workspaceFolder}",
          },
        }
      end

      -- Go debugging
      dap.adapters.delve = {
        type = "server",
        port = "${port}",
        executable = {
          command = "dlv",
          args = { "dap", "-l", "127.0.0.1:${port}" },
        },
      }

      dap.configurations.go = {
        {
          type = "delve",
          name = "Debug",
          request = "launch",
          program = "${file}",
        },
        {
          type = "delve",
          name = "Debug test",
          request = "launch",
          mode = "test",
          program = "${file}",
        },
      }
    end,
  },

  -- JS debug adapter (needs to be built)
  {
    "microsoft/vscode-js-debug",
    build = "npm install --legacy-peer-deps && npx gulp vsDebugServerBundle && mv dist out && git checkout package-lock.json",
    lazy = true,
  },
}
