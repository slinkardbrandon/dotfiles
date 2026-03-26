return {
  "folke/persistence.nvim",
  lazy = false,
  opts = {},
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
