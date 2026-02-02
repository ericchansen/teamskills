"""Tests for skill query tools."""
import pytest
from unittest.mock import AsyncMock, patch

from tools import (
    find_experts_by_skills,
    get_team_skill_gaps,
    get_skill_summary,
    list_all_skills,
)


@pytest.fixture
def mock_db():
    """Mock database for testing."""
    with patch("tools.db") as mock:
        mock.fetch_all = AsyncMock()
        mock.fetch_one = AsyncMock()
        yield mock


@pytest.mark.asyncio
async def test_find_experts_empty_skills():
    """Test find_experts with no skills provided."""
    result = await find_experts_by_skills([])
    assert "No skills specified" in result


@pytest.mark.asyncio
async def test_find_experts_with_results(mock_db):
    """Test find_experts returns formatted results."""
    mock_db.fetch_all.return_value = [
        {
            "user_name": "Alice",
            "role": "Engineer",
            "team": "Platform",
            "skill_name": "Kubernetes",
            "proficiency_level": "L400",
            "category": "DevOps"
        },
        {
            "user_name": "Bob",
            "role": "Developer",
            "team": "Apps",
            "skill_name": "Kubernetes",
            "proficiency_level": "L300",
            "category": "DevOps"
        }
    ]
    
    result = await find_experts_by_skills(["Kubernetes"])
    
    assert "Found 2 team member(s)" in result
    assert "Alice" in result
    assert "Bob" in result
    assert "L400" in result
    assert "Expert" in result


@pytest.mark.asyncio
async def test_find_experts_no_results(mock_db):
    """Test find_experts with no matching users."""
    mock_db.fetch_all.return_value = []
    
    result = await find_experts_by_skills(["NonExistentSkill"])
    
    assert "No team members found" in result


@pytest.mark.asyncio
async def test_get_skill_gaps(mock_db):
    """Test skill gap analysis."""
    mock_db.fetch_all.return_value = [
        {
            "skill_name": "Rust",
            "category": "Programming",
            "total_users": 0,
            "expert_count": 0,
            "highest_level": None
        },
        {
            "skill_name": "Go",
            "category": "Programming",
            "total_users": 1,
            "expert_count": 0,
            "highest_level": "L200"
        }
    ]
    
    result = await get_team_skill_gaps()
    
    assert "Skill Gap Analysis" in result
    assert "Rust" in result
    assert "No Experts" in result


@pytest.mark.asyncio
async def test_get_skill_summary(mock_db):
    """Test skill summary statistics."""
    mock_db.fetch_one.return_value = {
        "total_users": 10,
        "total_skills": 50,
        "total_categories": 5,
        "total_user_skills": 200,
        "avg_proficiency": 2.5
    }
    mock_db.fetch_all.return_value = [
        {"name": "Python", "user_count": 8},
        {"name": "Azure", "user_count": 7}
    ]
    
    result = await get_skill_summary()
    
    assert "Team Skills Summary" in result
    assert "10" in result  # total users
    assert "Python" in result
    assert "Most Common Skills" in result


@pytest.mark.asyncio
async def test_list_all_skills(mock_db):
    """Test listing all skills."""
    mock_db.fetch_all.return_value = [
        {"skill_name": "Python", "category": "Programming", "user_count": 5},
        {"skill_name": "Azure", "category": "Cloud", "user_count": 8}
    ]
    
    result = await list_all_skills()
    
    assert "Available Skills" in result
    assert "Python" in result
    assert "Azure" in result
    assert "Programming" in result
    assert "Cloud" in result


@pytest.mark.asyncio
async def test_list_all_skills_empty(mock_db):
    """Test listing skills when database is empty."""
    mock_db.fetch_all.return_value = []
    
    result = await list_all_skills()
    
    assert "No skills found" in result
