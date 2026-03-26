return {
  "petertriho/nvim-scrollbar",
  dependencies = { "lewis6991/gitsigns.nvim" },
  config = function()
    require("scrollbar").setup({
      handle = { color = "#33467c" },
      marks = {
        Error = { color = "#db4b4b", text = { "█" } },
        Warn = { color = "#e0af68", text = { "█" } },
        Hint = { color = "#1abc9c", text = { "▐" } },
        Info = { color = "#0db9d7", text = { "▐" } },
        Search = { color = "#7aa2f7", text = { "▐" } },
      },
    })
    require("scrollbar.handlers.gitsigns").setup()
  end,
}
