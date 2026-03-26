-- Debugging (DAP)
return {
  {
    "mfussenegger/nvim-dap",
    dependencies = {
      "rcarriga/nvim-dap-ui",
      "nvim-neotest/nvim-nio",
      -- JS/TS debugger
      "mxsdev/nvim-dap-vscode-js",
    },
    config = function()
      local dap = require("dap")
      local dapui = require("dapui")

      dapui.setup()

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

      -- Node/TS debugging via js-debug
      require("dap-vscode-js").setup({
        debugger_path = vim.fn.stdpath("data") .. "/lazy/vscode-js-debug",
        adapters = { "pwa-node", "pwa-chrome" },
      })

      -- Helper: detect test runner (vitest or jest) by checking for config files
      local function detect_test_runner()
        if vim.fn.filereadable("vitest.config.ts") == 1
          or vim.fn.filereadable("vitest.config.js") == 1
          or vim.fn.filereadable("vitest.config.mts") == 1
        then
          return "vitest"
        end
        return "jest"
      end

      -- Helper: get the test name closest to cursor
      local function get_nearest_test_name()
        local line = vim.fn.line(".")
        for i = line, 1, -1 do
          local text = vim.fn.getline(i)
          local match = text:match('["\'](.+)["\']')
          if match and (text:match("^%s*it%(") or text:match("^%s*test%(") or text:match("^%s*describe%(")) then
            return match
          end
        end
        return nil
      end

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
            request = "launch",
            name = "Debug nearest test",
            cwd = "${workspaceFolder}",
            runtimeExecutable = "node",
            runtimeArgs = function()
              local runner = detect_test_runner()
              local test_name = get_nearest_test_name()
              local file = vim.fn.expand("%:p")

              if runner == "vitest" then
                local args = {
                  "./node_modules/vitest/vitest.mjs",
                  "run",
                  file,
                  "--no-file-parallelism",
                }
                if test_name then
                  table.insert(args, "-t")
                  table.insert(args, test_name)
                end
                return args
              else
                local args = {
                  "./node_modules/.bin/jest",
                  "--runInBand",
                  "--no-coverage",
                  file,
                }
                if test_name then
                  table.insert(args, "-t")
                  table.insert(args, test_name)
                end
                return args
              end
            end,
            console = "integratedTerminal",
          },
          {
            type = "pwa-node",
            request = "launch",
            name = "Debug test file",
            cwd = "${workspaceFolder}",
            runtimeExecutable = "node",
            runtimeArgs = function()
              local runner = detect_test_runner()
              local file = vim.fn.expand("%:p")

              if runner == "vitest" then
                return { "./node_modules/vitest/vitest.mjs", "run", file, "--no-file-parallelism" }
              else
                return { "./node_modules/.bin/jest", "--runInBand", "--no-coverage", file }
              end
            end,
            console = "integratedTerminal",
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

      -- .vscode/launch.json is read automatically by nvim-dap

      -- Keymaps
      local map = vim.keymap.set
      map("n", "<leader>db", dap.toggle_breakpoint, { desc = "Toggle breakpoint" })
      map("n", "<leader>dc", dap.continue, { desc = "Debug continue" })
      map("n", "<leader>do", dap.step_over, { desc = "Debug step over" })
      map("n", "<leader>di", dap.step_into, { desc = "Debug step into" })
      map("n", "<leader>dO", dap.step_out, { desc = "Debug step out" })
      map("n", "<leader>dt", dap.terminate, { desc = "Debug terminate" })
      map("n", "<leader>du", dapui.toggle, { desc = "Debug UI toggle" })
    end,
  },

  -- JS debug adapter (needs to be built)
  {
    "microsoft/vscode-js-debug",
    build = "npm install --legacy-peer-deps && npx gulp vsDebugServerBundle && mv dist out && git checkout package-lock.json",
    lazy = true,
  },
}
