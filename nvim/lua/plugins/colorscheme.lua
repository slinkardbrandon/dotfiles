-- All theme plugins are declared so lazy.nvim keeps them installed.
-- The active theme is read from a generated file.
local active = require("theme-active")

return {
  {
    "folke/tokyonight.nvim",
    lazy = active.colorscheme ~= "tokyonight",
    priority = 1000,
    config = function()
      require("tokyonight").setup({
        style = "night",
        transparent = active.transparent,
      })
      if active.colorscheme == "tokyonight" then
        vim.cmd.colorscheme("tokyonight")
      end
    end,
  },
  {
    "oxfist/night-owl.nvim",
    lazy = active.colorscheme ~= "night-owl",
    priority = 1000,
    config = function()
      require("night-owl").setup({
        transparent_background = active.transparent,
      })
      if active.colorscheme == "night-owl" then
        vim.cmd.colorscheme("night-owl")
      end
    end,
  },
  {
    "shaunsingh/nord.nvim",
    lazy = active.colorscheme ~= "nord",
    priority = 1000,
    config = function()
      if active.transparent then
        vim.g.nord_disable_background = true
      end
      if active.colorscheme == "nord" then
        vim.cmd.colorscheme("nord")
      end
    end,
  },
}
