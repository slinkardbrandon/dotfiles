function killport
    # Check if a port number was provided
    if not set -q argv[1]
        echo "Usage: killport <port_number>"
        return 1
    end

    # Find the Process ID (PID) using the port.
    # -t = "terse" mode, prints only the PID
    # -i :$argv[1] = finds files open on the specified internet port
    # 2>/dev/null suppresses errors from lsof if no process is found
    set -l pids (lsof -t -i :$argv[1] 2>/dev/null)

    # Check if any PIDs were found
    if test -n "$pids"
        echo "Found process(es) on port $argv[1]:"

        # Show the full process info before killing
        # This is good practice so you know what you're killing
        lsof -i :$argv[1]
        echo "" # Newline for readability

        echo "Attempting to kill PID(s): $pids"

        # Send the kill signal (SIGTERM, a graceful shutdown)
        kill $pids
        echo "Process(es) terminated."
    else
        echo "No process found running on port $argv[1]."
    end
end
