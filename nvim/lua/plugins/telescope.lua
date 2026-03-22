-- Fuzzy finder (Cmd+P / Cmd+Shift+P equivalent)
return {
  "nvim-telescope/telescope.nvim",
  branch = "0.1.x",
  dependencies = {
    "nvim-lua/plenary.nvim",
    { "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
  },
  config = function()
    local telescope = require("telescope")
    local actions = require("telescope.actions")

    telescope.setup({
      defaults = {
        mappings = {
          i = {
            ["<C-j>"] = actions.move_selection_next,
            ["<C-k>"] = actions.move_selection_previous,
            ["<Esc>"] = actions.close,
          },
        },
        file_ignore_patterns = { "node_modules", ".git/" },
      },
    })

    telescope.load_extension("fzf")

    local map = vim.keymap.set
    local builtin = require("telescope.builtin")

    -- Find files (Cmd+P equivalent)
    map("n", "<leader>f", builtin.find_files, { desc = "Find files" })
    map("n", "<leader>p", builtin.find_files, { desc = "Find files" })
    -- Command palette (Cmd+Shift+P equivalent)
    map("n", "<leader>P", builtin.commands, { desc = "Command palette" })
    -- Live grep (search across files)
    map("n", "<leader>sg", builtin.live_grep, { desc = "Search grep" })
    -- Find in open buffers
    map("n", "<leader>sb", builtin.buffers, { desc = "Search buffers" })
    -- Find recent files
    map("n", "<leader>sr", builtin.oldfiles, { desc = "Search recent" })
    -- Search help
    map("n", "<leader>sh", builtin.help_tags, { desc = "Search help" })
    -- Search word under cursor
    map("n", "<leader>sw", builtin.grep_string, { desc = "Search word" })
    -- Search diagnostics
    map("n", "<leader>sd", builtin.diagnostics, { desc = "Search diagnostics" })
  end,
}
