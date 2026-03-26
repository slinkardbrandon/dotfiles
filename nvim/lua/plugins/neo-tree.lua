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
    -- Custom diagnostic indicator component
    local common = require("neo-tree.sources.common.components")
    local orig_name = common.name
    common.name = function(config, node, state)
      local result = orig_name(config, node, state)
      local diag = state.diagnostics_lookup or {}
      local diag_state = diag[node:get_id()]
      if diag_state and diag_state.severity_string == "Error" then
        if type(result) == "table" and result.text then
          result.highlight = "NeoTreeDiagError"
        end
      elseif diag_state and diag_state.severity_string == "Warn" then
        if type(result) == "table" and result.text then
          result.highlight = "NeoTreeDiagWarn"
        end
      end
      return result
    end

    require("neo-tree").setup({
      enable_diagnostics = true,
      close_if_last_window = false,
      filesystem = {
        follow_current_file = { enabled = true },
        use_libuv_file_watcher = true,
        filtered_items = {
          visible = false,
          hide_dotfiles = false,
          hide_gitignored = true,
          hide_by_name = {
            ".git",
          },
        },
      },
      default_component_configs = {
        git_status = {
          symbols = {
            added = "+",
            modified = "~",
            deleted = "x",
            renamed = "→",
            untracked = "?",
            ignored = "◌",
            unstaged = "○",
            staged = "●",
            conflict = "!",
          },
        },
      },
      renderers = {
        file = {
          { "indent" },
          { "icon" },
          { "name", use_git_status_colors = true },
          { "diagnostics", symbols = { error = " ✗", warn = " ▲", info = " ▲", hint = " ▲" } },
          { "git_status", highlight = "NeoTreeDimText" },
        },
        directory = {
          { "indent" },
          { "icon" },
          { "name", use_git_status_colors = true },
          { "diagnostics", hide_when_expanded = true, symbols = { error = " ✗", warn = " ▲", info = " ▲", hint = " ▲" } },
          { "git_status", highlight = "NeoTreeDimText" },
        },
      },
      window = {
        width = 35,
      },
    })
  end,
}
