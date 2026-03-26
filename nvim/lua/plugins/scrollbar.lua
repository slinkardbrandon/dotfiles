-- DO NOT EDIT — generated from scrollbar.lua.tmpl by theme engine
return {
  "petertriho/nvim-scrollbar",
  dependencies = { "lewis6991/gitsigns.nvim" },
  config = function()
    require("scrollbar").setup({
      handle = { color = "#1d3b53" },
      marks = {
        Error = { color = "#ef5350", text = { "█" } },
        Warn = { color = "#addb67", text = { "█" } },
        Hint = { color = "#7fdbca", text = { "▐" } },
        Info = { color = "#00589e", text = { "▐" } },
        Search = { color = "#82aaff", text = { "▐" } },
      },
    })
    require("scrollbar.handlers.gitsigns").setup()
  end,
}
