function commit --description 'Git commit with custom message and fake timestamp offset'
    # Check if at least a message is provided
    if test (count $argv) -lt 1
        echo "Usage: commit \"message\" [time_offset]"
        echo "Examples:"
        echo "  commit \"feat: add new feature\" 5h    # 5 hours into the future"
        echo "  commit \"fix: bug fix\" -30m           # 30 minutes into the past"
        echo "Time offset format: [+/-]Xh (hours), [+/-]Xm (minutes), [+/-]Xd (days)"
        echo "Positive = future, Negative = past"
        return 1
    end

    set commit_message $argv[1]
    
    # Check if a time offset is provided
    if test (count $argv) -ge 2
        set time_offset $argv[2]
        
        # Calculate the timestamp
        # Parse the offset (e.g., "5h", "-30m", "2d", "-2d")
        set offset_value (string replace -r -- '(-?[0-9]+)[hmd]' '$1' $time_offset)
        set offset_unit (string replace -r -- '-?[0-9]+([hmd])' '$1' $time_offset)
        
        # Convert to seconds
        switch $offset_unit
            case 'h'
                set seconds (math "$offset_value * 3600")
            case 'm'
                set seconds (math "$offset_value * 60")
            case 'd'
                set seconds (math "$offset_value * 86400")
            case '*'
                echo "Invalid time unit. Use h (hours), m (minutes), or d (days)"
                return 1
        end
        
        # Calculate the fake timestamp
        # Positive values go into the future, negative values go into the past
        set fake_timestamp (math (date +%s) + $seconds)
        set fake_date (date -r $fake_timestamp "+%Y-%m-%d %H:%M:%S")
        
        # Commit with the fake timestamp
        env GIT_AUTHOR_DATE="$fake_date" GIT_COMMITTER_DATE="$fake_date" git commit -m "$commit_message"
        
        if test $seconds -lt 0
            echo "Committed with timestamp: $fake_date ($time_offset ago)"
        else
            echo "Committed with timestamp: $fake_date ($time_offset from now)"
        end
    else
        # Regular commit without timestamp manipulation
        git commit -m "$commit_message"
    end
end
