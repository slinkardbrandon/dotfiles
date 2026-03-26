return {
  "folke/persistence.nvim",
  lazy = false,
  opts = {},
  config = function(_, opts)
    require("persistence").setup(opts)
    vim.api.nvim_create_autocmd("User", {
      pattern = "PersistenceSavePre",
      callback = function()
        for _, buf in ipairs(vim.api.nvim_list_bufs()) do
          local ft = vim.bo[buf].filetype
          local bt = vim.bo[buf].buftype
          local name = vim.api.nvim_buf_get_name(buf):lower()
          local is_dap = ft:match("^dap") or name:match("dap") or name:match("%[dap")
          local is_excluded = ft == "neo-tree" or bt == "terminal" or is_dap
          if is_excluded then
            vim.api.nvim_buf_delete(buf, { force = true })
          end
        end
      end,
    })
  end,
  keys = {
    { "<leader>qs", function() require("persistence").load() end, desc = "Restore session" },
    { "<leader>qd", function() require("persistence").stop() end, desc = "Don't save session" },
  },
  init = function()
    vim.api.nvim_create_autocmd("VimEnter", {
      nested = true,
      callback = function()
        -- Clean up stale sessions (older than 4 days)
        local dir = require("persistence.config").options.dir
        local cutoff = os.time() - (4 * 24 * 60 * 60)
        local handle = vim.loop.fs_scandir(dir)
        if handle then
          while true do
            local name, type = vim.loop.fs_scandir_next(handle)
            if not name then break end
            if type == "file" then
              local path = dir .. "/" .. name
              local stat = vim.loop.fs_stat(path)
              if stat and stat.mtime.sec < cutoff then
                os.remove(path)
              end
            end
          end
        end
        -- Auto-restore session if nvim was opened with no arguments
        if vim.fn.argc() == 0 then
          require("persistence").load()
        end
      end,
    })
  end,
}
