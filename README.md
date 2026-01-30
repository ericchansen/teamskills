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

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: PostgreSQL

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
- ✅ Runs frontend dev server (http://localhost:3000)

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

## Development

The application includes 8 test users with diverse skill profiles across different Azure specializations. Use these to explore the functionality or add your own team members.

## Future Enhancements

- AI agent integration for natural language skill queries
- Export/reporting features (Excel, PDF)
- Authentication and authorization
- Skill endorsements/verification
- Learning resource links
- Skill gap analysis

## License

ISC
