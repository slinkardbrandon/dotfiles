function mempalace_copilot --description "Export Copilot CLI conversations into the mempalace palace"
    bun run --cwd ~/dotfiles src/copilot-transcripts.ts $argv
end
