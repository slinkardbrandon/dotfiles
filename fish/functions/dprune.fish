function dprune --description 'Prune old Docker containers, images, and networks'
    echo "🧹 Pruning Docker containers, images, and networks..."

    # Remove stopped containers
    docker container prune -f
    # Remove unused images
    docker image prune -f
    # Remove unused networks
    docker network prune -f

    echo "✅ Docker pruning complete!"
end
