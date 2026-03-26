-- Workspace-wide TypeScript diagnostics via tsc --noEmit
-- Re-checks on startup, save, and editor focus (like VS Code)
return {
  dir = ".",
  name = "workspace-diagnostics",
  config = function()
    local ns = vim.api.nvim_create_namespace("workspace_tsc")
    local tsc_root = nil
    local tsc_running = false
    local tsc_timer = nil

    local function parse_tsc_output(output)
      local diagnostics = {}
      for _, line in ipairs(vim.split(output, "\n")) do
        local file, lnum, col, severity_str, msg =
          line:match("^(.+)%((%d+),(%d+)%)%: (%w+) (.+)$")
        if file then
          local abs = vim.fn.fnamemodify(file, ":p")
          diagnostics[abs] = diagnostics[abs] or {}
          table.insert(diagnostics[abs], {
            lnum = tonumber(lnum) - 1,
            col = tonumber(col) - 1,
            message = msg,
            severity = severity_str == "error" and vim.diagnostic.severity.ERROR
              or vim.diagnostic.severity.WARN,
            source = "tsc",
          })
        end
      end
      return diagnostics
    end

    local function run_tsc()
      if not tsc_root or tsc_running then
        return
      end
      tsc_running = true

      vim.system(
        { "npx", "tsc", "--noEmit", "--pretty", "false" },
        { cwd = tsc_root, text = true },
        function(result)
          vim.schedule(function()
            tsc_running = false

            -- Clear all previous workspace diagnostics
            for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
              vim.diagnostic.reset(ns, bufnr)
            end

            if not result.stdout or result.stdout == "" then
              return
            end

            local file_diags = parse_tsc_output(result.stdout)
            for filepath, diags in pairs(file_diags) do
              local bufnr = vim.fn.bufnr(filepath)
              if bufnr == -1 then
                bufnr = vim.fn.bufadd(filepath)
              end
              vim.diagnostic.set(ns, bufnr, diags)
            end
          end)
        end
      )
    end

    -- Debounced run to avoid hammering tsc on rapid saves
    local function run_tsc_debounced(delay)
      if tsc_timer then
        tsc_timer:stop()
      end
      tsc_timer = vim.defer_fn(run_tsc, delay or 1000)
    end

    -- On first ts_ls attach, discover root and kick off initial check
    vim.api.nvim_create_autocmd("LspAttach", {
      callback = function(ev)
        local client = vim.lsp.get_client_by_id(ev.data.client_id)
        if not client or client.name ~= "ts_ls" then
          return
        end
        if tsc_root then
          return
        end

        tsc_root = vim.fs.root(ev.buf, { "tsconfig.json" })
        if tsc_root then
          run_tsc_debounced(2000)
        end
      end,
    })

    -- Re-check on save of TS/JS files
    vim.api.nvim_create_autocmd("BufWritePost", {
      pattern = { "*.ts", "*.tsx", "*.js", "*.jsx" },
      callback = function()
        run_tsc_debounced(1000)
      end,
    })

    -- Re-check when switching back to nvim
    vim.api.nvim_create_autocmd("FocusGained", {
      callback = function()
        run_tsc_debounced(500)
      end,
    })

    vim.api.nvim_create_user_command("TSCWorkspace", function()
      if not tsc_root then
        tsc_root = vim.fs.root(0, { "tsconfig.json" })
      end
      if tsc_root then
        vim.notify("Running tsc --noEmit...", vim.log.levels.INFO)
        run_tsc()
      else
        vim.notify("No tsconfig.json found", vim.log.levels.WARN)
      end
    end, { desc = "Run workspace TypeScript diagnostics" })
  end,
}
