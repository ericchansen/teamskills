# Team Skills Tracker

A web application for tracking team member skills and proficiency levels across Azure products, use cases, and soft skills.

## Features

- **Skills Matrix View**: Visual table showing all team members and their skills
- **User Profiles**: Detailed view of individual skills with easy editing
- **Proficiency Levels**: Microsoft's L100-L400 scale with color coding
  - L100 (Red): Awareness - aware of the technology
  - L200 (Orange): Conversant - can discuss potential and use cases
  - L300 (Blue): Practitioner - hands-on experience, can speak competently
  - L400 (Green): Expert - deep expertise, can lead workshops
- **Skill Categories**: Organized by Azure Compute, Data, AI, Security, Networking, DevOps, Soft Skills, and Use Cases
- **Easy Skill Management**: Quick add/edit/delete with autocomplete
- **AI Chat Assistant**: Natural language queries for finding experts and analyzing team skills

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Agent**: Python + Microsoft Agent Framework
- **Database**: PostgreSQL
- **AI Model**: Azure AI Services (GPT-4o)

## 🚀 Quick Start with Docker (Recommended)

**Prerequisites**: Docker Desktop ([Get Docker](https://www.docker.com/products/docker-desktop/))

```bash
# Clone the repository
git clone <your-repo-url>
cd teamskills

# Start everything
docker-compose up --build
```

**Done!** Open http://localhost:3000 in your browser.

Docker automatically:
- ✅ Starts PostgreSQL with test data
- ✅ Runs backend API (http://localhost:3001)
- ✅ Runs agent service (http://localhost:8000)
- ✅ Runs frontend dev server (http://localhost:3000)

### Chat Assistant Setup

The AI chat assistant requires Azure AI Services credentials. Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your Azure AI Services settings:
```
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
```

Without these credentials, the chat will show "Agent not available" but all other features work normally.

See [DOCKER.md](DOCKER.md) for detailed Docker commands and troubleshooting.

---

## Alternative: Local Setup (Without Docker)

**Prerequisites**: 
- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

## Setup Instructions

### 1. Database Setup

Create a PostgreSQL database:
```bash
psql -U postgres
CREATE DATABASE teamskills;
\q
```

Initialize the schema and seed data:
```bash
psql -U postgres -d teamskills -f database/schema.sql
psql -U postgres -d teamskills -f database/seed.sql
```

### 2. Backend Setup

Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```
DB_USER=postgres
DB_HOST=localhost
DB_NAME=teamskills
DB_PASSWORD=your_password
DB_PORT=5432
PORT=3001
```

Install dependencies and start the backend:
```bash
npm install
npm start
```

The API will run on http://localhost:3001

### 3. Frontend Setup

Install frontend dependencies:
```bash
cd frontend
npm install
```

Start the development server:
```bash
npm run dev
```

The frontend will run on http://localhost:3000

## Loading Your Team Data

The repository includes demo data with fictional team members. To load your real team:

1. **Create your team seed file** by copying and modifying the demo:
   ```bash
   cp database/seed.sql database/seed-team.sql
   ```

2. **Edit `database/seed-team.sql`** with your real team members' names, emails, and skills

3. **Load your team data** (replaces demo data):
   ```bash
   # With Docker:
   docker-compose exec db psql -U postgres -d teamskills -c "TRUNCATE users, user_skills, skill_relationships RESTART IDENTITY CASCADE;"
   docker-compose exec -T db psql -U postgres -d teamskills < database/seed-team.sql
   
   # Without Docker:
   psql -U postgres -d teamskills -c "TRUNCATE users, user_skills, skill_relationships RESTART IDENTITY CASCADE;"
   psql -U postgres -d teamskills -f database/seed-team.sql
   ```

> **Note**: `seed-team.sql` is gitignored to protect your team's personal information.

## Usage

1. Open http://localhost:3000 in your browser
2. **Matrix View**: See all team members and their skills at a glance
3. **Click a user name** to view their detailed profile
4. **Add Skills**: Click "+ Add Skill" button, search for skills, and select proficiency level
5. **Update Proficiency**: Use dropdown in profile view to change skill levels
6. **Filter Skills**: Use category filter in matrix view to focus on specific skill areas
7. **Chat Assistant**: Click the 💬 button to ask questions like:
   - "Who knows Kubernetes?"
   - "What skill gaps do we have?"
   - "Give me a team skills summary"

## API Endpoints

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get single user
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Skills
- `GET /api/skills` - Get all skills
- `GET /api/skills/:id` - Get single skill
- `GET /api/skills/:id/related` - Get related skills
- `POST /api/skills` - Create skill
- `PUT /api/skills/:id` - Update skill
- `DELETE /api/skills/:id` - Delete skill

### Skill Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category

### User Skills
- `GET /api/user-skills/:userId` - Get all skills for a user
- `PUT /api/user-skills` - Update or create user skill
- `DELETE /api/user-skills` - Remove user skill

### Matrix
- `GET /api/matrix` - Get complete matrix data (users × skills)

### Agent (Chat Assistant)
- `GET /agent/status` - Check agent availability and capabilities
- `POST /chat` - Send message and get complete response
- `POST /chat/stream` - Send message and get streaming SSE response

## Development

The application includes 8 test users with diverse skill profiles across different Azure specializations. Use these to explore the functionality or add your own team members.

## Future Enhancements

- Export/reporting features (Excel, PDF)
- Skill endorsements/verification
- Learning resource links
- MCP PostgreSQL integration for advanced queries
- Team filtering/labels for users

## Authentication

The app supports Microsoft Entra ID (Azure AD) authentication. When configured, users can sign in with their Microsoft accounts and edit their own skill profiles.

See [docs/authentication.md](docs/authentication.md) for setup instructions.

**Quick summary:**
- Register an app in Microsoft Entra ID
- Set `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` environment variables
- Users are matched by email or auto-created on first login

Without authentication configured, the app runs in demo mode with a simple user picker.

## PR Preview Environments

Every pull request automatically gets an isolated staging environment for review.

### How It Works

1. **Open a PR** → GitHub Actions deploys a staging environment
2. **Bot comments** on the PR with frontend and backend URLs
3. **Push updates** → Environment is redeployed with latest changes
4. **Close/merge PR** → Environment is automatically deleted

### Staging Environment Details

Each PR gets:
- Isolated Container Apps (backend + frontend)
- Dedicated PostgreSQL database with demo data
- Unique URLs: `https://ca-frontend-pr{number}.*.azurecontainerapps.io`

### Cost Optimization

- Uses cheapest PostgreSQL SKU (B1ms Burstable)
- Container Apps scale to zero when idle
- Resources deleted automatically on PR close
- Shares production ACR to avoid duplicate registry costs

---

## Azure Deployment

This project can be deployed to Azure using the Azure Developer CLI (azd).

### Prerequisites

- [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli) installed and logged in
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) installed

### Deploy to Azure

```bash
# Login to Azure
az login
azd auth login

# Deploy everything (infrastructure + code)
azd up
```

This will:
- Create a resource group with PostgreSQL, Container Registry, Container Apps, and Azure AI Services
- Build and push Docker images to the registry
- Deploy all three services (backend, frontend, agent)
- Configure RBAC for the agent to call Azure AI Services

### Tear Down Azure Resources

To delete all Azure resources created by this project:

```bash
# Delete all resources (with purge for soft-deleted resources)
azd down --force --purge -e <environment-name>
```

The `--force` flag skips confirmation prompts, and `--purge` permanently deletes soft-deletable resources like Key Vaults and Cognitive Services accounts.

**Note**: If azd down fails, you can manually delete the resource group:
```bash
az group delete --name rg-<environment-name> --yes --no-wait
```

### Useful Commands

```bash
# List deployed environments
azd env list

# Show environment details (URLs, settings)
azd env get-values -e <environment-name>

# Deploy only code changes (no infrastructure changes)
azd deploy

# Deploy only infrastructure changes
azd provision

# View deployment logs
az containerapp logs show --name <app-name> --resource-group <rg-name> --tail 50
```

## License

ISC
