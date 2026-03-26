local map = vim.keymap.set

-- Clear search highlight
map("n", "<Esc>", "<cmd>nohlsearch<CR>")

-- Better window navigation
map("n", "<C-h>", "<C-w>h")
map("n", "<C-j>", "<C-w>j")
map("n", "<C-k>", "<C-w>k")
map("n", "<C-l>", "<C-w>l")

-- Resize windows
map("n", "<C-Up>", "<cmd>resize +2<CR>")
map("n", "<C-Down>", "<cmd>resize -2<CR>")
map("n", "<C-Left>", "<cmd>vertical resize -2<CR>")
map("n", "<C-Right>", "<cmd>vertical resize +2<CR>")

-- Buffers (like tabs in VSCode)
map("n", "<S-l>", "<cmd>bnext<CR>")
map("n", "<S-h>", "<cmd>bprev<CR>")
map("n", "<leader>x", "<cmd>bdelete<CR>", { desc = "Close buffer" })

-- Move lines up/down in visual mode
map("v", "J", ":m '>+1<CR>gv=gv")
map("v", "K", ":m '<-2<CR>gv=gv")

-- Keep cursor centered when scrolling
map("n", "<C-d>", "<C-d>zz")
map("n", "<C-u>", "<C-u>zz")

-- Keep cursor centered when searching
map("n", "n", "nzzzv")
map("n", "N", "Nzzzv")

-- Paste without losing register
map("x", "<leader>p", [["_dP]], { desc = "Paste without yank" })

-- Quick save
map("n", "<leader>w", "<cmd>w<CR>", { desc = "Save" })

-- File explorer
map("n", "<leader>e", "<cmd>Neotree toggle<CR>", { desc = "File explorer" })
map("n", "<leader>b", "<cmd>Neotree toggle<CR>", { desc = "File explorer" })
