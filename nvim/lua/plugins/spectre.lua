-- Cross-file search and replace
return {
  "nvim-pack/nvim-spectre",
  dependencies = { "nvim-lua/plenary.nvim" },
  keys = {
    { "<leader>S", function() require("spectre").toggle() end, desc = "Search & replace" },
    { "<leader>S", function() require("spectre").open_visual() end, desc = "Replace selection", mode = "v" },
  },
}
