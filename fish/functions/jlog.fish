function jlog --description "Run command and prettify JSON log output"
    if test (count $argv) -eq 0
        echo "Usage: jlog <command> [args...]"
        echo "Runs a command and formats JSON log lines with colors"
        return 1
    end

    $argv 2>&1 | while read -l line
        # Try to detect if line looks like JSON (starts with {)
        if string match -qr '^\s*\{' -- "$line"
            # Attempt to parse and format with jq
            set -l formatted (echo "$line" | jq -r '
                # Recursively unescape JSON strings (e.g., "{\"foo\":1}" -> {"foo":1})
                def unescape_json_strings:
                    if type == "object" then
                        to_entries | map(
                            .value |= (
                                if type == "string" and (startswith("{") or startswith("[")) then
                                    (fromjson? // .) | unescape_json_strings
                                else
                                    unescape_json_strings
                                end
                            )
                        ) | from_entries
                    elif type == "array" then
                        map(unescape_json_strings)
                    else
                        .
                    end;

                def color($code): "\u001b[\($code)m";
                def reset: "\u001b[0m";
                def bold: "\u001b[1m";

                # Level colors: 30=info(green), 40=warn(yellow), 50+=error(red)
                def level_color:
                    if .level >= 50 then color("31") + bold  # red bold
                    elif .level >= 40 then color("33")       # yellow
                    elif .level >= 30 then color("32")       # green
                    elif .level >= 20 then color("36")       # cyan
                    else color("90")                          # gray
                    end;

                def level_name:
                    if .level >= 60 then "FATAL"
                    elif .level >= 50 then "ERROR"
                    elif .level >= 40 then "WARN"
                    elif .level >= 30 then "INFO"
                    elif .level >= 20 then "DEBUG"
                    else "TRACE"
                    end;

                # Highlight standalone numbers in cyan (not embedded in words/paths)
                def highlight_numbers:
                    gsub("(?<n>\\b[0-9]+\\b)"; color("36") + .n + reset);

                # Format timestamp (only if it looks like an ISO string)
                def fmt_time:
                    if .time and (.time | type) == "string" and (.time | contains("T")) then
                        (.time | split("T")[1] | split(".")[0])
                    elif .timestamp and (.timestamp | type) == "string" then
                        (.timestamp | split("T")[1] | split(".")[0])
                    else ""
                    end;

                # Format message with optional number highlighting
                def fmt_msg:
                    if .level >= 40 then
                        level_color + .msg + reset
                    else
                        (.msg | highlight_numbers)
                    end;

                # Format HTTP request details if present
                def fmt_http:
                    if .method and .url then
                        " " + color("35") + .method + reset +
                        " " + (.url | highlight_numbers) +
                        (if .status then
                            " " + (if .status >= 400 then color("31") else color("32") end) +
                            (.status | tostring) + reset
                        else "" end) +
                        (if .elapsed then
                            " " + color("90") + (.elapsed | tostring) + "ms" + reset
                        elif .time and (.time | type) == "number" then
                            " " + color("90") + (.time | tostring) + "ms" + reset
                        else "" end)
                    else ""
                    end;

                # Build output (unescape nested JSON first)
                unescape_json_strings |
                (level_color + "[" + level_name + "]" + reset + " " +
                 (if fmt_time != "" then color("90") + fmt_time + reset + " " else "" end) +
                 fmt_msg +
                 fmt_http +
                 (if .err or .error then
                    "\n       " + color("31") + (.err // .error | tostring) + reset
                  else "" end) +
                 (if .errors then
                    "\n       " + color("31") + (.errors | tostring) + reset
                  else "" end))
            ' 2>/dev/null)

            if test $status -eq 0 -a -n "$formatted"
                echo "$formatted"
            else
                # jq failed, output original line
                echo "$line"
            end
        else
            # Not JSON, pass through
            echo "$line"
        end
    end
end
