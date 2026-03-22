-- File explorer sidebar
return {
  "nvim-neo-tree/neo-tree.nvim",
  branch = "v3.x",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "nvim-tree/nvim-web-devicons",
    "MunifTanjim/nui.nvim",
  },
  config = function()
    require("neo-tree").setup({
      close_if_last_window = true,
      filesystem = {
        follow_current_file = { enabled = true },
        filtered_items = {
          visible = false,
          hide_dotfiles = false,
          hide_gitignored = true,
          hide_by_name = {
            ".git",
          },
        },
      },
      window = {
        width = 35,
      },
    })
  end,
}
