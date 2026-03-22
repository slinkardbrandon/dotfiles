-- Formatting (Prettier, etc.)
return {
  "stevearc/conform.nvim",
  event = "BufWritePre",
  config = function()
    local prettier_fts = {
      "typescript",
      "typescriptreact",
      "javascript",
      "javascriptreact",
      "json",
      "html",
      "css",
      "markdown",
      "yaml",
    }

    -- Prettier config files to look for
    local prettier_configs = {
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.yml",
      ".prettierrc.yaml",
      ".prettierrc.json5",
      ".prettierrc.js",
      ".prettierrc.cjs",
      ".prettierrc.mjs",
      ".prettierrc.toml",
      "prettier.config.js",
      "prettier.config.cjs",
      "prettier.config.mjs",
    }

    local function has_prettier_config(bufnr)
      local filepath = vim.api.nvim_buf_get_name(bufnr)
      if filepath == "" then return false end

      -- Check for prettier config in package.json
      local root = vim.fs.root(bufnr, { "package.json" })
      if root then
        local pkg_path = root .. "/package.json"
        local f = io.open(pkg_path, "r")
        if f then
          local content = f:read("*a")
          f:close()
          if content:find('"prettier"') then return true end
        end
      end

      -- Check for standalone prettier config files
      local config_root = vim.fs.root(bufnr, prettier_configs)
      return config_root ~= nil
    end

    -- Build formatters_by_ft: prettier for web languages, others always-on
    local formatters_by_ft = {
      lua = { "stylua" },
      go = { "gofmt" },
    }

    for _, ft in ipairs(prettier_fts) do
      formatters_by_ft[ft] = { "prettierd", "prettier", stop_after_first = true }
    end

    require("conform").setup({
      formatters_by_ft = formatters_by_ft,
      format_on_save = function(bufnr)
        local ft = vim.bo[bufnr].filetype

        -- Prettier filetypes: only format if config detected
        if vim.tbl_contains(prettier_fts, ft) then
          if not has_prettier_config(bufnr) then
            return nil -- skip formatting
          end
        end

        return {
          timeout_ms = 2000,
          lsp_fallback = true,
        }
      end,
    })

    -- Manual format keybind (always works regardless of config)
    vim.keymap.set({ "n", "v" }, "<leader>cf", function()
      require("conform").format({ async = true, lsp_fallback = true })
    end, { desc = "Format" })
  end,
}
