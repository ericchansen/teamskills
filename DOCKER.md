# Quick Start with Docker (Recommended)

## Prerequisites
- Docker Desktop installed ([Get Docker](https://www.docker.com/products/docker-desktop/))
- That's it! No PostgreSQL or Node.js installation needed.

## Start the Application

```bash
# Start everything (first time - builds images)
docker-compose up --build

# Or use the npm script
npm run docker
```

**That's it!** Docker will:
- ✅ Start PostgreSQL database
- ✅ Initialize schema and seed data automatically
- ✅ Start the backend API on http://localhost:3001
- ✅ Start the frontend on http://localhost:3000

Open your browser to **http://localhost:3000** and start using the app!

## Docker Commands

```bash
# Start (after first build)
docker-compose up

# Start in background
docker-compose up -d

# Stop everything
docker-compose down

# Stop and remove database (fresh start)
docker-compose down -v

# View logs
docker-compose logs -f

# Restart just one service
docker-compose restart backend
```

## NPM Scripts

```bash
npm run docker          # Build and start everything
npm run docker:up       # Start without rebuilding
npm run docker:down     # Stop all services
npm run docker:reset    # Complete reset (deletes database)
```

## Development Workflow

The setup includes hot-reload for development:
- **Backend**: Changes to `backend/` files restart the API automatically
- **Frontend**: Changes to `frontend/src/` files update instantly in browser
- **Database**: Persisted in Docker volume (survives restarts)

## Troubleshooting

### Port Already in Use
If ports 3000, 3001, or 5432 are in use:
```bash
# Stop other services or modify ports in docker-compose.yml
docker-compose down
```

### Database Issues
Reset the database completely:
```bash
npm run docker:reset
```

### See Container Logs
```bash
docker-compose logs backend   # Backend logs
docker-compose logs frontend  # Frontend logs
docker-compose logs db        # Database logs
```

### Clean Everything
```bash
docker-compose down -v
docker system prune -a
```
