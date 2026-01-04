function dnuke --description 'Aggressively remove all Docker containers, volumes, images, networks, and cache'
    echo "💣 NUKING Docker environment..."
    echo "⚠️  This will remove ALL containers, volumes, images, networks, and cache!"

    read -P "Are you sure? [y/N] " -l confirm

    if test "$confirm" = "y" -o "$confirm" = "Y"
        echo "🗑️  Stopping all running containers..."
        docker stop (docker ps -aq) 2>/dev/null; or true

        echo "🗑️  Removing all containers..."
        docker rm -f (docker ps -aq) 2>/dev/null; or true

        echo "🗑️  Removing all volumes..."
        docker volume rm -f (docker volume ls -q) 2>/dev/null; or true

        echo "🗑️  Removing all images..."
        docker rmi -f (docker images -aq) 2>/dev/null; or true

        echo "🗑️  Removing all networks (except defaults)..."
        docker network prune -f

        echo "🗑️  Removing build cache..."
        docker builder prune -af

        echo "💥 Docker nuke complete! Everything has been removed."
    else
        echo "❌ Nuke cancelled."
    end
end
