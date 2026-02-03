"""Skill query tools for the agent.

These tools allow the AI agent to query team skills data.
"""
import logging
from typing import Optional

from db import db

logger = logging.getLogger(__name__)


async def find_experts_by_skills(skills: list[str], min_proficiency: str = "L200") -> str:
    """Find team members who have expertise in the specified skills.
    
    Args:
        skills: List of skill names to search for (case-insensitive partial match)
        min_proficiency: Minimum proficiency level (L100, L200, L300, L400)
    
    Returns:
        Formatted string describing team members and their skill levels
    """
    logger.info(f"find_experts_by_skills called with skills={skills}, min_proficiency={min_proficiency}")
    logger.info(f"Database connected: {db.is_connected}")
    
    if not skills:
        return "No skills specified. Please provide at least one skill to search for."
    
    # Build query with skill name patterns
    skill_patterns = [f"%{skill.lower()}%" for skill in skills]
    placeholders = ", ".join(f"${i+2}" for i in range(len(skill_patterns)))
    
    proficiency_order = {"L100": 1, "L200": 2, "L300": 3, "L400": 4}
    min_level = proficiency_order.get(min_proficiency, 2)
    
    query = f"""
        SELECT 
            u.name as user_name,
            u.role,
            u.team,
            s.name as skill_name,
            us.proficiency_level,
            sc.name as category
        FROM user_skills us
        JOIN users u ON us.user_id = u.id
        JOIN skills s ON us.skill_id = s.id
        LEFT JOIN skill_categories sc ON s.category_id = sc.id
        WHERE LOWER(s.name) ILIKE ANY(ARRAY[{placeholders}])
        AND CASE us.proficiency_level 
            WHEN 'L100' THEN 1 
            WHEN 'L200' THEN 2 
            WHEN 'L300' THEN 3 
            WHEN 'L400' THEN 4 
        END >= $1
        ORDER BY 
            CASE us.proficiency_level 
                WHEN 'L400' THEN 1 
                WHEN 'L300' THEN 2 
                WHEN 'L200' THEN 3 
                WHEN 'L100' THEN 4 
            END,
            u.name
    """
    
    logger.info(f"Executing query with min_level={min_level}, patterns={skill_patterns}")
    results = await db.fetch_all(query, min_level, *skill_patterns)
    logger.info(f"Query returned {len(results)} results")
    
    if not results:
        return f"No team members found with skills matching: {', '.join(skills)} (minimum {min_proficiency})"
    
    # Group by user
    users: dict[str, list[dict]] = {}
    for row in results:
        name = row["user_name"]
        if name not in users:
            users[name] = {"role": row["role"], "team": row["team"], "skills": []}
        users[name]["skills"].append({
            "skill": row["skill_name"],
            "level": row["proficiency_level"],
            "category": row["category"]
        })
    
    # Format output
    lines = [f"Found {len(users)} team member(s) with matching skills:\n"]
    for name, info in users.items():
        lines.append(f"**{name}** ({info['role'] or 'No role'}, {info['team'] or 'No team'})")
        for skill in info["skills"]:
            level_desc = {
                "L100": "Beginner",
                "L200": "Intermediate", 
                "L300": "Practitioner",
                "L400": "Expert"
            }.get(skill["level"], skill["level"])
            lines.append(f"  - {skill['skill']}: {skill['level']} ({level_desc})")
        lines.append("")
    
    return "\n".join(lines)


async def get_team_skill_gaps() -> str:
    """Identify skills that have low coverage or no experts on the team.
    
    Returns:
        Formatted string describing skill gaps and recommendations
    """
    # Find skills with no L300+ experts
    query = """
        SELECT 
            s.name as skill_name,
            sc.name as category,
            COUNT(DISTINCT us.user_id) as total_users,
            COUNT(DISTINCT CASE WHEN us.proficiency_level IN ('L300', 'L400') THEN us.user_id END) as expert_count,
            MAX(us.proficiency_level) as highest_level
        FROM skills s
        LEFT JOIN skill_categories sc ON s.category_id = sc.id
        LEFT JOIN user_skills us ON s.id = us.skill_id
        GROUP BY s.id, s.name, sc.name
        ORDER BY expert_count ASC, total_users ASC
        LIMIT 20
    """
    
    results = await db.fetch_all(query)
    
    if not results:
        return "Unable to analyze skill gaps - no skills data available."
    
    # Categorize gaps
    no_experts = []
    low_coverage = []
    
    for row in results:
        if row["expert_count"] == 0:
            no_experts.append(row)
        elif row["total_users"] < 2:
            low_coverage.append(row)
    
    lines = ["## Team Skill Gap Analysis\n"]
    
    if no_experts:
        lines.append("### Skills with No Experts (L300+)")
        lines.append("These skills have no team members at practitioner or expert level:\n")
        for skill in no_experts[:10]:
            total = skill["total_users"] or 0
            highest = skill["highest_level"] or "None"
            lines.append(f"- **{skill['skill_name']}** ({skill['category'] or 'Uncategorized'}): {total} user(s), highest: {highest}")
        lines.append("")
    
    if low_coverage:
        lines.append("### Skills with Low Coverage")
        lines.append("These skills have only 1 person with knowledge:\n")
        for skill in low_coverage[:10]:
            lines.append(f"- **{skill['skill_name']}** ({skill['category'] or 'Uncategorized'}): Single point of knowledge")
        lines.append("")
    
    if not no_experts and not low_coverage:
        lines.append("Good news! The team has reasonable coverage across all tracked skills.")
    
    return "\n".join(lines)


async def get_skill_summary() -> str:
    """Get a high-level summary of team skills.
    
    Returns:
        Formatted string with team skills statistics
    """
    stats_query = """
        SELECT 
            COUNT(DISTINCT u.id) as total_users,
            COUNT(DISTINCT s.id) as total_skills,
            COUNT(DISTINCT sc.id) as total_categories,
            COUNT(us.id) as total_user_skills,
            AVG(CASE us.proficiency_level 
                WHEN 'L100' THEN 1 
                WHEN 'L200' THEN 2 
                WHEN 'L300' THEN 3 
                WHEN 'L400' THEN 4 
            END) as avg_proficiency
        FROM users u
        CROSS JOIN skills s
        LEFT JOIN skill_categories sc ON s.category_id = sc.id
        LEFT JOIN user_skills us ON u.id = us.user_id AND s.id = us.skill_id
    """
    
    top_skills_query = """
        SELECT s.name, COUNT(us.id) as user_count
        FROM skills s
        JOIN user_skills us ON s.id = us.skill_id
        GROUP BY s.id, s.name
        ORDER BY user_count DESC
        LIMIT 5
    """
    
    stats = await db.fetch_one(stats_query)
    top_skills = await db.fetch_all(top_skills_query)
    
    if not stats:
        return "Unable to retrieve team skill summary."
    
    avg_level = stats.get("avg_proficiency")
    avg_desc = "N/A"
    if avg_level:
        if avg_level < 1.5:
            avg_desc = "Beginner"
        elif avg_level < 2.5:
            avg_desc = "Intermediate"
        elif avg_level < 3.5:
            avg_desc = "Practitioner"
        else:
            avg_desc = "Expert"
    
    lines = [
        "## Team Skills Summary\n",
        f"- **Team Members:** {stats.get('total_users', 0)}",
        f"- **Skills Tracked:** {stats.get('total_skills', 0)}",
        f"- **Skill Categories:** {stats.get('total_categories', 0)}",
        f"- **Total Skill Assignments:** {stats.get('total_user_skills', 0)}",
        f"- **Average Proficiency:** {avg_desc}",
        ""
    ]
    
    if top_skills:
        lines.append("### Most Common Skills")
        for skill in top_skills:
            lines.append(f"- {skill['name']}: {skill['user_count']} team member(s)")
    
    return "\n".join(lines)


async def list_all_skills() -> str:
    """List all available skills grouped by category.
    
    Returns:
        Formatted string listing all skills
    """
    query = """
        SELECT 
            s.name as skill_name,
            sc.name as category,
            COUNT(us.id) as user_count
        FROM skills s
        LEFT JOIN skill_categories sc ON s.category_id = sc.id
        LEFT JOIN user_skills us ON s.id = us.skill_id
        GROUP BY s.id, s.name, sc.name
        ORDER BY sc.name NULLS LAST, s.name
    """
    
    results = await db.fetch_all(query)
    
    if not results:
        return "No skills found in the database."
    
    # Group by category
    categories: dict[str, list[dict]] = {}
    for row in results:
        cat = row["category"] or "Uncategorized"
        if cat not in categories:
            categories[cat] = []
        categories[cat].append({"name": row["skill_name"], "users": row["user_count"]})
    
    lines = ["## Available Skills\n"]
    for cat, skills in sorted(categories.items()):
        lines.append(f"### {cat}")
        for skill in skills:
            lines.append(f"- {skill['name']} ({skill['users']} users)")
        lines.append("")
    
    return "\n".join(lines)

