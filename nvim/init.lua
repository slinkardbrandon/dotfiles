-- Leader key (must be set before lazy.nvim)
vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- Core options
require("options")

-- Keymaps
require("keymaps")

-- Plugin manager (lazy.nvim)
require("lazy-bootstrap")

-- Load plugins
require("lazy").setup("plugins", {
  change_detection = { notify = false },
})
