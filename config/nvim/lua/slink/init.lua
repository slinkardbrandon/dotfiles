-- Things you'd set in vim script
vim.o.swapfile = false -- never create a swap file
vim.o.number = true -- enable line numbers
vim.o.ignorecase = "smartcase" -- find case insensitive UNLESS capital letter is used
vim.o.tabstop = 2 -- actual tabs should be 2 spaces wide
vim.o.shiftwidth = 2 -- actual tabs should be 2 spaces wide
vim.o.expandtab = true -- pressing tab should create spaces instead of tab characters.
vim.o.showcmd = true -- Display when the leader key is active
vim.o.hlsearch = true -- Highlight search matches
vim.o.incsearch = "hlsearch"

-- Things you'd set with "let"
vim.g.mapleader = " " -- vim leader key to <space> for custom commands

