return {
  "christoomey/vim-tmux-navigator",
  lazy = false,
  init = function()
    vim.g.tmux_navigator_no_mappings = 1
  end,
  config = function()
    vim.keymap.set("n", "<M-h>", "<cmd>TmuxNavigateLeft<cr>", { desc = "Navigate left" })
    vim.keymap.set("n", "<M-j>", "<cmd>TmuxNavigateDown<cr>", { desc = "Navigate down" })
    vim.keymap.set("n", "<M-k>", "<cmd>TmuxNavigateUp<cr>", { desc = "Navigate up" })
    vim.keymap.set("n", "<M-l>", "<cmd>TmuxNavigateRight<cr>", { desc = "Navigate right" })
    vim.keymap.set("n", "<C-h>", "<cmd>TmuxNavigateLeft<cr>", { desc = "Navigate left" })
    vim.keymap.set("n", "<C-j>", "<cmd>TmuxNavigateDown<cr>", { desc = "Navigate down" })
    vim.keymap.set("n", "<C-k>", "<cmd>TmuxNavigateUp<cr>", { desc = "Navigate up" })
    vim.keymap.set("n", "<C-l>", "<cmd>TmuxNavigateRight<cr>", { desc = "Navigate right" })
    -- Unmap Ctrl+` (sent as C-@) so tmux can handle the terminal popup toggle
    vim.keymap.set("n", "<C-@>", "<Nop>")
  end,
}
