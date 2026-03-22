-- Syntax highlighting and code understanding
return {
  "nvim-treesitter/nvim-treesitter",
  build = ":TSUpdate",
  config = function()
    -- nvim 0.12+ uses vim.treesitter directly
    -- Just ensure parsers are installed
    local ensure_installed = {
      "typescript",
      "tsx",
      "javascript",
      "go",
      "lua",
      "json",
      "yaml",
      "toml",
      "html",
      "css",
      "bash",
      "fish",
      "markdown",
      "gitcommit",
      "diff",
    }

    -- Auto-install missing parsers
    vim.api.nvim_create_autocmd("FileType", {
      callback = function()
        local ft = vim.bo.filetype
        pcall(function()
          vim.treesitter.start()
        end)
      end,
    })

    -- Install parsers
    local installed = {}
    for _, lang in ipairs(ensure_installed) do
      local ok = pcall(vim.treesitter.language.inspect, lang)
      if not ok then
        table.insert(installed, lang)
      end
    end

    if #installed > 0 then
      vim.cmd("TSInstall " .. table.concat(installed, " "))
    end
  end,
}
