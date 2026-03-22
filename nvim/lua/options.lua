local opt = vim.opt

-- Line numbers
opt.number = true
opt.relativenumber = true

-- Tabs & indentation
opt.tabstop = 2
opt.shiftwidth = 2
opt.expandtab = true
opt.smartindent = true

-- Search
opt.ignorecase = true
opt.smartcase = true
opt.hlsearch = true
opt.incsearch = true

-- Appearance
opt.termguicolors = true
opt.signcolumn = "yes"
opt.cursorline = true
opt.scrolloff = 8
opt.sidescrolloff = 8
opt.wrap = false

-- Splits
opt.splitright = true
opt.splitbelow = true

-- System clipboard
opt.clipboard = "unnamedplus"

-- Undo persistence
opt.undofile = true
opt.swapfile = false

-- Faster updates
opt.updatetime = 250
opt.timeoutlen = 300

-- Trailing whitespace highlight
vim.api.nvim_set_hl(0, "TrailingWhitespace", { bg = "#db4b4b" })
vim.fn.matchadd("TrailingWhitespace", [[\s\+$]])

-- Strip trailing whitespace on save
vim.api.nvim_create_autocmd("BufWritePre", {
  pattern = "*",
  callback = function()
    local pos = vim.api.nvim_win_get_cursor(0)
    vim.cmd([[%s/\s\+$//e]])
    vim.api.nvim_win_set_cursor(0, pos)
  end,
})
